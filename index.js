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

// Imports the Google Cloud client library
import {PubSub} from "@google-cloud/pubsub";

//Define destination topics
const topic_destination = "projects/ftx-streaming-demo/topics/ftx_us_";

// Creates a Pub/Sub API client; cache this for further use
const pubSubClient = new PubSub();

// An array of the market names 
var marketList = [];
// An array of the subscribed market names 
var marketSubscribeList = [];

// command line arguments
const clArgs = process.argv.slice(2);
console.log(clArgs);

// flag to output message
var outputMessages = false;
if(clArgs.length > 0 && clArgs[0] === "true") {
    outputMessages = true;
}

//Creates a websocket API client
import WebSocket from "websocket";
var WebSocketClient = WebSocket.client;
var wsReconnectInterval = 1000 * 5;

var client;

var connect = async function() { 

    client = new WebSocketClient();
    client.connect('wss://ftx.us/ws/', null);

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

                //console.log(JSON.stringify(data))

                // Checks market list data
                if (data.channel === 'markets') {
                    logMessage("Markets \n" + new Date().toISOString() + "\n" + JSON.stringify(data));
                    checkMarketList(data);
                }

                // publishes the data to the matching topic
                if (data.type === 'update' & (data.channel === 'trades' || data.channel === 'ticker')) { 
                    publishMessage(JSON.stringify(data), formatTopicName(data.channel, data.market));
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

        //Subscribe to market data channels
        function subscribeToChannel(channelName, marketName) {
            if (connection.connected) {
     
                connection.send(JSON.stringify({
                    'op': 'subscribe',
                    'channel': channelName,
                    'market': marketName
                }));
            
            }
        }

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
        //  - check if there is a topic for the market name
        //  - if there is, then 
        //       - save that market name into the list
        //       - then subsribe to the market feed
        //  - if there is not, then 
        //       - create a topic, 
        //       - save the market name into the list
        //       - then subsribe to the market feed
        async function checkMarketList(marketListData) {

            // null check
            if(marketListData == null || marketListData.data == null || marketListData.data.data == null) 
                return;

            for (const marketKey in marketListData.data.data) {
                console.log("Checking " + marketKey);
                if(marketList.includes(marketKey)) {
                    // then check subscribe list
                    if(marketSubscribeList.includes(marketKey)) {
                        // do nothing
                        console.log(marketKey + " already subscribed");
                    } else {
                        // subscribe
                        console.log("Subscribing " + marketKey);
                        subscribeToChannel("ticker", marketKey);
                        subscribeToChannel("trades", marketKey);
                        marketSubscribeList.push(marketKey);
                    }
                } else {
                    // check if topic, if not, then create
                    // just focus on one for now
                    //if(marketKey === "BTC/USD") { 
                        console.log("Checking topic for " + marketKey);
                        createPubSubTopic(formatTopicName("trades", marketKey),marketKey);
                        await sleep(1000);
                        createPubSubTopic(formatTopicName("ticker", marketKey),marketKey);
                        await sleep(1000);
                        marketList.push(marketKey);
                    //}
                }
            }


        }


        // formats topic name according to naming convention
        function formatTopicName(channel, market) {

            market = market.replace("/","_");
            var topicName = topic_destination + channel.toLowerCase() + "_" + market.toLowerCase();
            logMessage(topicName);
            return topicName;
        }

        //
        // Creates PubSub topic 
        // Once created, it will subscribe to the websocket using the market name
        // If topic already created, then it will just subscribe using the market name
        async function createPubSubTopic(topicName, market) {

            try {
                var topic = pubSubClient.topic(topicName);
                topic.exists(async (err, exists) => {
                    if (err) {
                        console.error(`Error looking for specified topic ${topicName}: ${error}`);
                        process.exit(1);
                    } else {
                        if (!exists) {
                            console.error(`Topic ${topicName} not found, creating...`);
                            topic.create(async (err, topic, apiResponse) => {
                                if (err) {
                                    console.error(`Could not create non-existent topic ${topicName}: ${apiResponse} ${err}`);
                                    //process.exit(1);
                                } else {
                                    console.error(`Created topic ${topicName}`);
                                    //publishMessages();
                                    //console.log(JSON.stringify(apiResponse));
                                    sleep(3000);
                                    console.log("Subscribing " + market);
                                    subscribeToChannel("ticker", market);
                                    sleep(3000);
                                    subscribeToChannel("trades", market);
                                    marketSubscribeList.push(market);
                                }
                            });
                        } else {
                            // do nothing for now
                            console.log(topicName + " topic exists");
                            console.log("Subscribing " + market);
                            subscribeToChannel("ticker", market);
                            subscribeToChannel("trades", market);
                            marketSubscribeList.push(market);
                        }
                    }
                });
            } catch (error) {
                console.error(`Error: ${error}`);
                //process.exit(1);
            }


        }

        subscribeToMarketList();
        
    });
};

//Connect to FTX US websocket server
connect();

// Function to publish message to Pub/Sub topic
async function publishMessage(data, topic) {
    const dataBuffer = Buffer.from(data);
      try {
      const messageId = await pubSubClient
        .topic(topic)
        .publishMessage({data: dataBuffer});
      logMessage(`Message ${messageId} published.`);
    } catch (error) {
      console.error(`Received error while publishing: ${error.message}`);
      //process.exitCode = 1;
    }
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

