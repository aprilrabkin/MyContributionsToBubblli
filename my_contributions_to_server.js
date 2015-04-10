
//upload profile pictures for worlds and landmarks 
app.post('/api/upload', isLoggedIn, function (req, res) {

  var fstream;
  req.pipe(req.busboy);

  req.busboy.on('file', function (fieldname, file, filename, filesize, mimetype) {

      if (mimetype == 'image/jpeg' || mimetype == 'image/png' || mimetype == 'image/gif' || mimetype == 'image/jpg'){
        if (req.headers['content-length'] > 10000000){
         console.log("Filesize too large.");
        }
        else {


        var stuff_to_hash = filename + (new Date().toString());
        var object_key = crypto.createHash('md5').update(stuff_to_hash).digest('hex'); 
        var fileType = filename.split('.').pop(); 
        var date_in_path = (new Date().getUTCFullYear()) + "/" + (new Date().getUTCMonth()) + "/"
        var current = object_key + "." + fileType;
        var tempPath = "app/dist/temp_avatar_uploads/" + current;
        var awsKey = date_in_path + current;

        fstream = fs.createWriteStream(tempPath);
        var count = 0; 
        var totalSize = req.headers['content-length'];


        file.on('data', function(data) {
          count += data.length;
          var percentUploaded = Math.floor(count/totalSize * 100);
          io.emit('uploadstatus',{ message: "Uploaded " + percentUploaded + "%"} );
        }).pipe(fstream);

        fstream.on('close', function () {

        var buffer = readChunk.sync(tempPath, 0, 262);

        if (fileTypeProcess(buffer) == false){
          fs.unlink(tempPath); //Need to add an alert if there are several attempts to upload bad files here
        }
        else {   
         im.crop({
          srcPath: tempPath, 
          dstPath: tempPath,
          width: 300,
          height: 300,
          quality: 85,
          gravity: "Center"
        }, function(err, stdout, stderr){

          fs.readFile(tempPath, function(err, fileData) {

            var s3 = new AWS.S3(); 

            s3.putObject({ Bucket: 'if-server-avatar-images', Key: awsKey, Body: fileData, ACL:'public-read'}, function(err, data) {
              if (err)       
                console.log(err);   
              else {    
                res.send("https://s3.amazonaws.com/if-server-avatar-images/" + awsKey);
              fs.unlink(tempPath); 
            }
            });
          });
        
        });   
        }                    
       });
      }
      }
      else {
        res.send(500,'Please use .jpg .png or .gif');
      
      
}
    });


});

//upload pictures not for avatars
app.post('/api/uploadPicture', isLoggedIn, function (req, res) {

  var fstream;
  req.pipe(req.busboy);

  req.busboy.on('file', function (fieldname, file, filename, filesize, mimetype) {

    if (mimetype == 'image/jpeg' || mimetype == 'image/png' || mimetype == 'image/gif' || mimetype == 'image/jpg'){
      if (req.headers['content-length'] > 10000000){
        console.log("Filesize too large.");
      }
      else {

      var stuff_to_hash = filename + (new Date().toString());
      var object_key = crypto.createHash('md5').update(stuff_to_hash).digest('hex'); 
      var fileType = filename.split('.').pop(); 
      var date_in_path = (new Date().getUTCFullYear()) + "/" + (new Date().getUTCMonth()) + "/"
      var current = object_key + "." + fileType;
      var tempPath = "app/dist/temp_general_uploads/" + current;
      var awsKey = date_in_path + current;
      fstream = fs.createWriteStream(tempPath);
      var count = 0; 
      var totalSize = req.headers['content-length'];

      file.on('data', function(data) {
        count += data.length;
        var percentUploaded = Math.floor(count/totalSize * 100);
        io.emit('uploadstatus',{ message: "Uploaded " + percentUploaded + "%"} );
      }).pipe(fstream);

      fstream.on('close', function () {

        var buffer = readChunk.sync(tempPath, 0, 262);

        if (fileTypeProcess(buffer) == false){
                    fs.unlink(tempPath); //Need to add an alert if there are several attempts to upload bad files here
                  }
                  else {  
                    im.resize({
                      srcPath: tempPath,
                      dstPath: tempPath,
                      width: 600,
                      quality: 0.8
                    }, function(err, stdout, stderr){

                      fs.readFile(tempPath, function(err, fileData) {

                        var s3 = new AWS.S3(); 
                        s3.putObject({ Bucket: 'if-server-general-images', Key: awsKey, Body: fileData, ACL:'public-read'}, function(err, data) {

                          if (err) 
                            console.log(err);
                          else {    
                            res.send("https://s3.amazonaws.com/if-server-general-images/" + awsKey);
                            fs.unlink(tempPath);
                          }
                        });
                      });
                    });
                  }
                });
}
}
else {
  res.send(500,'Please use .jpg .png or .gif');

}
});
});



function generate_xml_sitemap(){
    var root_path = 'http://www.bubbl.li/';
    var priority = 0.5;
    var freq = 'monthly';

  landmarkSchema.find({}, {'id':1}, function (err, docs) {
    if (err) {
      console.log("Error Occured: ", err);
    } else { 

      var xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
      for (var i in docs) {
        xml += '<url>';
        xml += '<loc>'+ root_path + '/w/' + docs[i].id + '</loc>';
        xml += '<changefreq>'+ freq +'</changefreq>';
        xml += '<priority>'+ priority +'</priority>';
        xml += '</url>';
        i++;
      }
      xml += '</urlset>';
      console.log(xml);
      return xml;
    }
    });
}

app.get('/sitemap.xml', function(req, res) {
    res.header('Content-Type', 'text/xml');
    res.send(generate_xml_sitemap());     
})
