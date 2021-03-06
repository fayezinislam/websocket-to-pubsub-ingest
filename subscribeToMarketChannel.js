#!/usr/bin/env node

// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//Creates a websocket API client
import WebSocket from "websocket";
var WebSocketClient = WebSocket.client;
var wsReconnectInterval = 1000 * 1;

// used to launch external process
import childProcess from "child_process";
const {
  exec
} = childProcess

// Imports the Google Cloud client library
import {InstanceGroupManagersClient} from "@google-cloud/compute";
// Creates a GCP Compute API client; cache this for further use
//const computeClient = new Compute();
const computeMIGClient = new InstanceGroupManagersClient();

// An array of the market names 
var marketList = [];
// An array of the subscribed market names 
var marketSubscribeList = [];

// [0]=ws-url [1]=topic-prefix [2]=debug
// command line arguments
const clArgs = process.argv.slice(2);
console.log(clArgs);

var wsUrl;
var topicPrefix;
// flag to output message
var outputMessages = false;
var project;
var zone;
var itName;
var marketPairLimit;

// node subscribeToMarketChannel.js $PROJECT_NAME $ZONE $TEMPLATE_NAME $WS_URL $TOPIC_PREFIX $PAIRS_LIMIT $DEBUG
if(clArgs.length != 7) {
    console.error("Incorrect number of arguments. \nUsage: node subscribeToMarketChannel.js {ws-url} {topic-prefix} {market-pair-limit} {debug}");
} else {

    project = clArgs[0];
    zone = clArgs[1];
    itName = clArgs[2];
    wsUrl = clArgs[3];
    topicPrefix = clArgs[4];
    marketPairLimit = clArgs[5];
    if(clArgs[6] === "true") {
        outputMessages = true;
    }
}


var client;

var connect = async function() { 

    client = new WebSocketClient();
    client.connect(wsUrl, null);

    //On connection failure log error to console
    client.on('connectFailed', function(error) {
        console.log('Connect Error: ' + error.toString());
    });

    //Define actions for successful connection
    client.on('connect', function(connection) {
        console.log('WebSocket Client Connected');
        connection.on('error', function(error) {
            console.log("Connection Error: " + error.toString());
            setTimeout(connect, wsReconnectInterval);
        });
        connection.on('close', function() {
            console.log('Connection Closed. Attempting to reconnect...');
            // subscriptions have been lost, so reset subscriptions
            marketSubscribeList = [];  
            setTimeout(connect, wsReconnectInterval);
        });
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                //Parse JSON message & add receive timestamp
                var data = JSON.parse(message.utf8Data);
                data.time_ws = getTimestamp();

                // Checks market list data
                if (data.channel === 'markets') {
                    logMessage("Markets \n" + new Date().toISOString() + "\n" + JSON.stringify(data));
                    checkMarketList(data);
                }

                //Print message in console
                logMessage("Received: '" + JSON.stringify(data) + "'");
            }
        });
        
        //Send pings every 15 seconds to keep connection alive
        function sendPing() {
            if (connection.connected) {
                connection.send(JSON.stringify({
                    op: 'ping'
                }));
                logMessage("ping " + new Date(new Date()-3600*1000*3).toISOString());
                setTimeout(sendPing, 15000);
            }
        }
        sendPing();

        // Subscribe to market data channel to get list of markets
        // an updated set of market list will be sent every 60sec
        function subscribeToMarketList() {
            if (connection.connected) {
               
                connection.send(JSON.stringify({
                    'op': 'subscribe',
                    'channel': 'markets'
                }));

            }
        }

        // Parses through market list
        // Checks previous list to see if there are any changes
        // If no previous list, then iterate through each one
        //  - for each market pair that is not in the list, then
        //    launch the market pair MIG
        async function checkMarketList(marketListData) {

            // null check
            if(marketListData == null || marketListData.data == null || marketListData.data.data == null) 
                return;

            var marketPairCounter = 0;
            for (const marketKey in marketListData.data.data) {
                console.log("Checking " + marketKey);
                if(!marketList.includes(marketKey)) {

                    
                    // launch process here
                    // Gets market pairs up to marketPairLimit parameter
                    if(marketPairLimit > 0 && marketPairCounter < marketPairLimit) {
                        console.log("Starting process for " + marketKey);
                        await sleep(1000);
                        launchExternalProcess(marketKey);
                        marketList.push(marketKey);
                    } else if(marketPairCounter <= 0) {
                        // no limit
                        console.log("Starting process for " + marketKey);
                        await sleep(1000);
                        launchExternalProcess(marketKey);
                        marketList.push(marketKey);
                    }
                    marketPairCounter++;
                    
                }
            }
            console.log("Processes started for " + marketPairCounter + " market pairs");
        }

        subscribeToMarketList();
        
    });
};

//Connect to websocket server
connect();

// execute external process for each market pair
async function launchExternalProcess(marketPair) {

    // This code was kept to show that the MIG can be launched in several ways

    // arguments: [0]=marketPair [1]=ws-url [2]=topic-prefix [3]=debug
    // Launch as a Node.js Process
    // var command = "node subscribeToMarketPairChannels.js \"" + marketPair + "\" \"" + wsUrl + "\" \"" + topicPrefix + "\" " + outputMessages;
    
    // Launch as a separate Docker container
    //var marketPairStr = marketPair.replace("/","-");
    //var command = "sudo docker run -d --rm --name market-pair-" + marketPairStr + " market-pair-channels \"" + marketPair + "\" \"" + wsUrl + "\" \"" + topicPrefix + "\" " + outputMessages;
    
    // Launch as a separate MIG instance
    /*
    var marketPairStr = marketPair.replace("/","-").toLowerCase();
    var igName = "subscribe-marketpair-" + marketPairStr + "-ig";
    var command = "gcloud compute instance-groups managed create " + igName + " --project=" + project + " --base-instance-name=" + igName + " --size=1 --template=" + itName + " --zone=" + zone + " && gcloud beta compute instance-groups managed set-autoscaling " + igName + " --project=" + project + " --zone=" + zone + " --cool-down-period=30 --max-num-replicas=1 --min-num-replicas=1 --mode=on --target-cpu-utilization=0.9";

    console.log("Launching process: " + command);
    exec(command, (error, stdout, stderr) => {
      console.log(error, stdout, stderr)
    });
    */

    // Use the Node.js gcloud SDK to create the MIG
    var itNameUrl = "https://www.googleapis.com/compute/v1/projects/" + project + "/global/instanceTemplates/" + itName;
    var marketPairStr = marketPair.replace("/","-").toLowerCase();
    var igName = "subscribe-marketpair-" + marketPairStr + "-ig";

    console.log(
      `Creating the ${igName} MIG in ${zone} from template ${itNameUrl}`
    );

    var igManagerResource = {};
    igManagerResource.name = igName;
    igManagerResource.baseInstanceName = igName;
    igManagerResource.targetSize = 1;
    igManagerResource.instanceTemplate = itNameUrl;

    // Construct request
    const request = {
      "instanceGroupManagerResource": igManagerResource,
      "project": project,
      "zone": zone
    };

    //console.log(request);
    //console.log(JSON.stringify(request));

    // Run request
    const response = await computeMIGClient.insert(request);
    console.log('Create MIG request submitted.');
    logMessage(response);

    
}

//Function to get current timestamp in UTC
function getTimestamp() {
    var date = new Date();
    var result = 
        date.getUTCFullYear()+"-"
        +pad(date.getUTCMonth()+1)+"-"
        +pad(date.getUTCDate())+" "
        +pad(date.getUTCHours())+":"
        +pad(date.getUTCMinutes())+":"
        +pad(date.getUTCSeconds())+"."
        +date.getUTCMilliseconds()+"000+00:00";
    return result;
  }

//Function to pad timestamp single digits with zero for data formatting
function pad(n){return n<10 ? '0'+n : n}

function logMessage(message) {
    if(outputMessages) {
        console.log(message);
    }
}

function sleep(millis) {
    return new Promise(resolve => setTimeout(resolve, millis));
}

