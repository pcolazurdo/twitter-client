/*jshint node:true*/

// app.js
// This file contains the server side JavaScript code for your application.
// This sample application uses express as web application framework (http://expressjs.com/),
// and jade as template engine (http://jade-lang.com/).

var express = require('express');
var url = require('url');
var querystring = require('querystring');
var log4js = require('log4js');
var util = require('util');
var twitter = require('twitter');
var pouchdb = require('pouchdb');
var http = require('http');





log4js.loadAppender('file');
log4js.addAppender(log4js.appenders.file('output.log',null,10000000000));

// the important part ;)
log4js.replaceConsole()
var logger = log4js.getLogger();
//

if (process.env.VCAP_SERVICES) {
    // Running on Bluemix. Parse the process.env for the port and host that we've been assigned.
    var env = JSON.parse(process.env.VCAP_SERVICES);
    var host = process.env.VCAP_APP_HOST;
    var port = process.env.VCAP_APP_PORT;
    console.log('VCAP_SERVICES: %s', process.env.VCAP_SERVICES);
    // Also parse out Cloudant settings.
    var cloudant = env['cloudantNoSQLDB'][0]['credentials'];
}


//Capture all Unhandled Errors - seems not recommended in production but for time being it is useful
/*
process.on('uncaughtException', function(err) {
    setTimeout(function() {
    console.log("Catched Fire on getting services")
    console.log(err);},3000);
  });
*/

var db = new pouchdb('tweets'),
	 remote =cloudant.url + '/tweets';
	opts = {
	  continuous: true
	  };
     // Replicate the DB to remote
	console.log(remote);
	db.replicate.to(remote, opts);
	db.replicate.from(remote, opts);

	// Put 3 documents into the DB

	 db.put({
		  author: 'Authur C Clarke',
		  Title : '2001: A Space Odyssey'
		}, 'book2', function (err, response) {
		  console.log(err || response);
		});
	 db.put({
		  author: 'Dan Brown',
		  Title : 'Digital Fortress'
		}, 'book3', function (err, response) {
		  console.log(err || response);
		});
	 res.writeHead(200, {'Content-Type': 'text/plain'});
	 res.write("3 documents is inserted");
	 res.end();
}; // End insert_records






console.log("App Started: " + Date().toString());

// setup middleware
var app = express();
app.use(express.errorHandler());
app.use(express.urlencoded()); // to support URL-encoded bodies
app.use(app.router);

app.use(express.static(__dirname + '/public')); //setup static public directory
app.set('view engine', 'jade');
app.set('views', __dirname + '/views'); //optional since express defaults to CWD/views

// There are many useful environment variables available in process.env.
// VCAP_APPLICATION contains useful information about a deployed application.
var appInfo = JSON.parse(process.env.VCAP_APPLICATION || "{}");
// TODO: Get application information and use it in your app.
var twitterInfo = JSON.parse(process.env.TWITTER_INFO || "{}");

// defaults for dev outside bluemix
var service_url = '<service_url>';
var service_username = '<service_username>';
var service_password = '<service_password>';

var configTwitter = require('./twitter-cred.json');
var twit = new twitter(configTwitter);

twit.stream('user', {track:'pcolazurdo'}, function(stream) {
    //stream.on('data', function(data) {
    //    console.log(util.inspect(data));
    //});
    stream.on('favorite', function(data) {
        console.log(data.target_object.text);
        db.put(data, data.target_object.id_str, function (err, response) {
            console.log(err || response);
          });

    });
    // Disconnect stream after five seconds
    //setTimeout(stream.destroy, 5000);
});


// VCAP_SERVICES contains all the credentials of services bound to
// this application. For details of its content, please refer to
// the document or sample of each service.
if (process.env.VCAP_SERVICES) {
  console.log('Parsing VCAP_SERVICES');
  var services = JSON.parse(process.env.VCAP_SERVICES);
  //service name, check the VCAP_SERVICES in bluemix to get the name of the services you have

  try {
    var service_name = 'language_identification';
    if (services[service_name]) {
      var svc = services[service_name][0].credentials;
      service_url = svc.url;
      service_username = svc.username;
      service_password = svc.password;
    } else {
      console.log('The service '+service_name+' is not in the VCAP_SERVICES, did you forget to bind it?');
    }
  }
  catch (e){
    setTimeout(function() {
        console.log("Catched Fire on getting services")
        console.log(e);
    }, 3000);
  }
} else {
  console.log('No VCAP_SERVICES found in ENV, using defaults for local development');
  service_url = "http://locahost:3000/api/log/"
}

console.log('service_url = ' + service_url);
console.log('service_username = ' + service_username);
console.log('service_password = ' + new Array(service_password.length).join("X"));


var auth = 'Basic ' + new Buffer(service_username + ':' + service_password).toString('base64');

//
// API REST
//
app.get( '/api', function( request, response ) {
    var resp = [
            {
                Application: "twitter-client",
                ServiceUrl: service_url,
                Status: "Ok"
            }
        ];
    response.send(resp);
});

app.get( '/api/log/:text', function(request, response) {log_json(request, response);});

app.post( '/api/log/:text', function(request, response) {log_json(request, response);});


//
// PAGES
//


// render index page
app.get('/', function(req, res){
    res.render('index');
});


// Handle the form POST containing the text to identify with Watson and reply with the language
app.post('/', function(req, res){
  var request_data = {
    'txt': req.body.txt,
    'sid': 'lid-generic',  // service type : language identification (lid)
    'rt':'json' // return type e.g. json, text or xml
  };

  var parts = url.parse(service_url); //service address

  // create the request options to POST our question to Watson
  var options = { host: parts.hostname,
    port: parts.port,
    path: parts.pathname,
    method: 'POST',
    headers: {
      'Content-Type'  :'application/x-www-form-urlencoded', // only content type supported
      'X-synctimeout' : '30',
      'Authorization' :  auth }
  };

  // Create a request to POST to the Watson service
  var watson_req = https.request(options, function(result) {
    result.setEncoding('utf-8');
    var responseString = '';

    result.on("data", function(chunk) {
      responseString += chunk;
    });

    result.on('end', function() {
      var lang = JSON.parse(responseString).lang;
      return res.render('index',{ 'txt': req.body.txt, 'lang': lang });
    })

  });

  watson_req.on('error', function(e) {
    return res.render('index', {'error':e.message})
  });

  // create the request to Watson
  watson_req.write(querystring.stringify(request_data));
  watson_req.end();

});


// The IP address of the Cloud Foundry DEA (Droplet Execution Agent) that hosts this application:
var host = (process.env.VCAP_APP_HOST || 'localhost');
// The port on the DEA for communication with the application:
var port = (process.env.VCAP_APP_PORT || 3000);
// Start server
app.listen(port, host);


function log_json (request, response) {
    console.log("GET /api/log/*");
    var resp = [
            {
                Application: "twitter-client",
                ServiceUrl: service_url,
                Status: "Ok",
                Log: request.params.text
            }
        ];

    response.send(resp);
};
