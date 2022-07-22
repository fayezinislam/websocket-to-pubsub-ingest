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

// Creates a Pub/Sub API client; cache this for further use
const pubSubClient = new PubSub();

// command line arguments
// [0]=marketPair [1]=ws-url [2]=topic-prefix [3]=debug
const clArgs = process.argv.slice(2);
console.log(clArgs);

// flag to output message
var marketPair;
var wsUrl;
var topicPrefix;
var outputMessages = false;
// node subscribeToMarketPairChannels.js $MKT_PAIR $WS_URL $TOPIC_PREFIX $DEBUG
if(clArgs.length != 4) {
    console.error("Incorrect number of arguments. \nUsage: node subscribeToMarketPairChannels.js {marketpair} {ws-url} {topic-prefix} {debug}");
} else {

    marketPair = clArgs[0];
    wsUrl = clArgs[1];
    topicPrefix = clArgs[2];
    if(clArgs[3] === "true") {
        outputMessages = true;
    }
}

//Creates a websocket API client
import WebSocket from "websocket";
var WebSocketClient = WebSocket.client;
var wsReconnectInterval = 1000 * 1;

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
            setTimeout(connect, wsReconnectInterval);
        });
        connection.on('message', function(message) {
            if (message.type === 'utf8') {
                //Parse JSON message & add receive timestamp
                var data = JSON.parse(message.utf8Data);
                data.time_ws = getTimestamp();

                // publishes the data to the matching topic
                if (data.type === 'update' & (data.channel === 'trades' || data.channel === 'ticker' || data.channel === 'orderbook') && data.market === marketPair) { 
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

        // This is the function that is being called to start it all
        async function subscribeToMarketChannels(marketPair) {

            // Create the topic if it doesn't exist
            // Once created, then subscribe and publish messages
            await console.log("checking " + marketPair + " trades");
            await createPubSubTopic(formatTopicName("trades", marketPair),marketPair,"trades");
            await sleep(2000);
            await console.log("checking " + marketPair + " ticker");
            await createPubSubTopic(formatTopicName("ticker", marketPair),marketPair,"ticker");
            await sleep(2000);
            await console.log("checking " + marketPair + " orderbook");
            await createPubSubTopic(formatTopicName("orderbook", marketPair),marketPair,"orderbook");
            await sleep(2000);

        }

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

        //
        // Creates PubSub topic 
        // Once created, it will subscribe to the websocket using the market name
        // If topic already created, then it will just subscribe using the market name
        async function createPubSubTopic(topicName, market, channelName) {

            try {
                var topic = pubSubClient.topic(topicName);
                await topic.exists(async (err, exists) => {
                    if (err) {
                        console.error(`Error looking for specified topic ${topicName}: ${err}`);
                        process.exit(1);
                    } else {
                        if (!exists) {
                            console.error(`Topic ${topicName} not found, creating...`);
                            await topic.create(async (err, topic, apiResponse) => {
                                if (err) {
                                    console.error(`Could not create non-existent topic ${topicName}: ${apiResponse} ${err}`);
                                    //process.exit(1);
                                } else {
                                    console.error(`Created topic ${topicName}`);
                                    //console.log(JSON.stringify(apiResponse));
                                    await sleep(3000);
                                    console.log("Subscribing " + market + " " + channelName);
                                    subscribeToChannel(channelName, market);
                                }
                            });
                        } else {
                            // topic already exists, subscribe to channel
                            console.log(topicName + " topic exists");
                            console.log("Subscribing " + market + " " + channelName);
                            subscribeToChannel(channelName, market);
                        }
                    }
                });
            } catch (error) {
                console.error(`Error: ${error}`);
                //process.exit(1);
            }


        }

        subscribeToMarketChannels(marketPair);
        
    });
};

subscribeToMarketPair();

/** 
 * First check if the PubSub topic exists.  If not, create the topics
 * Once the topics are in place, connect to the websocket service
 * and publish messages
 **/
async function subscribeToMarketPair() {

    if(marketPair === undefined || marketPair === "") {
        console.error("market pair invalid");
        process.exit(1);
    }

    // Subscribe to websocket
    connect();

}


// formats topic name according to naming convention
function formatTopicName(channel, market) {

    market = market.replace("/","_");
    var topicName = topicPrefix + channel.toLowerCase() + "_" + market.toLowerCase();
    logMessage(topicName);
    return topicName;
}


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

