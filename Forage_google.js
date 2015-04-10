var express = require('express'),
    app = module.exports.app = express();
var request = require('request');
var logger = require('morgan');
var async = require('async');

var fs = require('fs');
var http = require('http');

var im = require("imagemagick");
var crypto = require('crypto');
var AWS = require('aws-sdk');

app.use(logger('dev'));

var bodyParser = require('body-parser');

app.use(bodyParser.json({
    extended: true
})); // get information from html forms

var mongoose = require('mongoose'),
    monguurl = require('monguurl');

//----MONGOOOSE----//

//var styleSchema = require('../../../components/IF_schemas/style_schema.js');
var styles = require('./style_schema.js');
var landmarks = require('./landmark_schema.js');

mongoose.connect('mongodb://localhost/if');
var db_mongoose = mongoose.connection;
db_mongoose.on('error', console.error.bind(console, 'connection error:'));

//var configDB = require('../../../components/IF_auth/database.js');
var forumStyle = require('./forum_theme.json');

var cloudMapName = 'forum';

//---------------//

var startLoopTime = new Date();

countYelpRecords();

function countYelpRecords(){

    landmarks.model(false)
        .find()
        .exists('source_yelp.id')
        .exec(function(err, docs) {
            if (err) {
                console.log("Error Occured: ", err);
            } else if (docs.length > 0) {
                var sizeOfDb = docs.length;
                console.log("sizeOfDb: ", sizeOfDb);
                findLatestYelpRecord(sizeOfDb);
            } else {
                console.log('No Yelp documents in database');
            }
        });
}

function findLatestYelpRecord(sizeOfDb) {
    console.log("finding newest yelp record");
    landmarks.model(false)
        .find()
        .exists('source_yelp.id')
        .sort("-_id")
        .limit(1)
        .exec(function(err, docs) {
            if (err) {
                console.log("Error while finding latest yelp record: ", err);
            } else if (docs.length > 0) {
                console.log("Newest yelp record and time created", docs[0].name, docs[0].time.created);
                var docZero = docs[0];
                (function(counter, docZero, sizeOfDb){
                    repeaterThroughYelpRecords(counter, docZero, sizeOfDb);
                    })(0, docZero, sizeOfDb);
            } else {
                console.log('No Documents found in findLatestYelpRecord');
            }
        });
}



function repeaterThroughYelpRecords(i, doc, sizeOfDb){

    if (i < sizeOfDb){

        console.log(i, " about to query mongodb for: ", doc.name, doc.id, doc.time.created);

        (function(){
            landmarks.model(false)
                .find()
                .exists('source_yelp.id')
                .where("_id")
                .lt(doc._id)
                .sort("-_id")
                .limit(1)
                .exec(function(err, docs) {
                    if (err) {
                        console.log(err);
                    }
                    else if (docs > 1){
                        console.log("docs > 1");
                    }
                    else if (docs < 1){
                        console.log("docs < 1"); //this should only happen after the loop finishes
                        repeaterThroughYelpRecords(i + 1, docs[0], sizeOfDb); 
                    }
                    else {
                        setTimeout(function(){
                            queryGooglePlaceID(docs[0]);
                            repeaterThroughYelpRecords(i + 1, docs[0], sizeOfDb);
                        }, 2000);
                    }
                });            
         })();
    }
    else {
        var endLoopTime = new Date();
        console.log("Done with all Yelp records in database. Records (i): ", i, (endLoopTime - startLoopTime)/1000, "seconds"); //Google allows 100,000 queries per day. Each loop/doc involves two google queries
    }

}

function queryGooglePlaceID(doc) {

    var name = doc.name;
    var address = doc.source_yelp.locationInfo.address;
    var yelpZip = doc.source_yelp.locationInfo.postal_code;
    var queryTermsToGetPlaceID = (name + "+" + address + "+" + yelpZip)
        .replace(/,/g, "")
        .replace(/\s/g, "+");
    var queryURLToGetPlaceID = "https://maps.googleapis.com/maps/api/place/textsearch/json?query=" + queryTermsToGetPlaceID + "&key=" + googleAPI;
    
    request({
        uri: queryURLToGetPlaceID,
        json: true
    }, function(error, response, body) {
        console.log("Queried Google PlaceID for: ", doc.name, queryURLToGetPlaceID);
        var resultsValid = ((!error) && (response.statusCode == 200) && (body.results.length >= 1));

        if (resultsValid) { 
           (function(name, yelpZip, address, bodyresults, doc){
                findMatchingResult(name, yelpZip, address, bodyresults, doc);                
           })(name, yelpZip, address, body.results, doc);

        } 
        else {
            console.log("no valid results returned from queryGooglePlaceID for", name, address, yelpZip);
        }
    });
}

function findMatchingResult(name, yelpZip, address, bodyresults, doc){

    console.log("Looking for placeID match for", name, address, yelpZip); 
    
    for (i = 0; i < bodyresults.length; i++) {
        
        var inTheUS = (bodyresults[i].formatted_address.indexOf(", United States") > 0);
        
        if (inTheUS){
            var googleZip = bodyresults[i].formatted_address.replace(/, United States/g, "").substr(-5, 5);
        }

        if (inTheUS && (googleZip == yelpZip)) {

            (function(doc, bodyresult){

                console.log("Matching placeID of", name, "is", bodyresult.place_id, " \n_id:  ", doc._id); 

                addGoogleDetails(bodyresult.place_id, bodyresult.name, doc); 

            })(doc, bodyresults[i]);

        }
        else {
            console.log("this one doesnt match");
        }
    } 
}



function addGoogleDetails(placeID, name, doc) {

    var queryURLToGetDetails = "https://maps.googleapis.com/maps/api/place/details/json?placeid=" + placeID + "&key=" + googleAPI;

    request({
        uri: queryURLToGetDetails,
        json: true
    }, function(error, response, body) {
        console.log("Queried Google details for", name, queryURLToGetDetails);

        if (!error && response.statusCode == 200) {
            doc.source_google.placeID = placeID;
            doc.source_google.icon = body.result.icon;
            // doc.source_google.opening_hours = body.result.opening_hours;                                       
            if (typeof body.result.opening_hours == 'undefined') {
                doc.source_google.opening_hours = "";
            } else {
                doc.source_google.opening_hours = '';
            }
            //doc.source_google.weekday_text = body.result.weekday_text;
            if (typeof body.result.weekday_text == 'undefined') {
                doc.source_google.weekday_text = "";
            } else {
                doc.source_google.weekday_text = body.result.weekday_text;
            }
            // doc.source_google.international_phone_number = body.result.international_phone_number;
            if (typeof body.result.international_phone_number == 'undefined') {
                doc.source_google.international_phone_number = "";
            } else {
                doc.source_google.international_phone_number = body.result.international_phone_number;
            }
            doc.source_google.price_level = body.result.price_level;
            // doc.source_google.reviews = body.result.reviews;
            if (typeof body.result.reviews == 'undefined') {
                doc.source_google.reviews = "";
            } else {
                doc.source_google.reviews = body.result.reviews;
            }
            doc.source_google.url = body.result.url;
            // doc.source_google.website = body.result.website;
            if (typeof body.result.website == 'undefined') {
                doc.source_google.website = "";
            } else {
                doc.source_google.website = body.result.website;
            }
            doc.source_google.types = body.result.types;
            doc.type = body.result.types[0];
            doc.source_google.utc_offset = body.result.utc_offset;
            doc.source_google.vicinity = body.result.vicinity;

            (function(doc){
                updateLandmark(doc);
            })(doc);

        }
    });
}


function updateLandmark(doc) {

    doc.save(function(err, docs) {

        if (err) {
            console.log(err)
        } else if (!err) {
            console.log("Updated landmark for", doc.name);      
        } else {
            console.log('jajja');
        }
    });
}