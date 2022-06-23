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
//const {PubSub} = require('@google-cloud/pubsub');
import {PubSub} from "@google-cloud/pubsub";

// Imports GOT library for REST API calls
//const got = require('got');
import got from "got";

//Define destination topics
const topic_destination = "projects/ftx-streaming-demo/topics/ftx_";

// Creates a Pub/Sub API client; cache this for further use
const pubSubClient = new PubSub();

// An array of the market names 
var marketList = [];
// An array of the subscribed market names 
var marketSubscribeList = [];
// An object index of the market name's last message received
var marketLastMessageList = {};
// Message buffer for markets
var marketMessageBuffer = {};
// Flag to indicate that it's a reconnect and need to 
// initialize and handle the buffers so the missing data
// can be retrieved
var handleReconnectBuffers = false;

// command line arguments
const clArgs = process.argv.slice(2);
console.log(clArgs);

// flag to output message
var outputMessages = false;
if(clArgs.length > 0 && clArgs[0] === "true") {
    outputMessages = true;
}

// Function to publish message to Pub/Sub topic
async function publishMessage(data, topic) {
    const dataBuffer = Buffer.from(data);
      try {
      const messageId = await pubSubClient
        .topic(topic)
        .publishMessage({data: dataBuffer});
      console.log(`Message ${messageId} published.`);
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

//Creates a websocket API client
//var WebSocketClient = require('websocket').client;
import WebSocket from "websocket";
var WebSocketClient = WebSocket.client;

var client = new WebSocketClient();

//On connection failure log error to console
client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

//Define actions for successful connection
client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('Connection Closed. Attempting to reconnect...');
        // subscriptions have been lost, so reset subscriptions
        marketSubscribeList = [];  
        //handleReconnectBuffers = true;
        client.connect('wss://ftx.us/ws/', null);
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            //Parse JSON message & add receive timestamp
            var data = JSON.parse(message.utf8Data);
            data.time_ws = getTimestamp();

            //console.log("WS data");
            //console.log(JSON.stringify(data))

            // Checks market list data
            if (data.channel === 'markets') {
                if(outputMessages)
                    console.log("Markets \n" + new Date().toISOString() + "\n" + JSON.stringify(data));
                checkMarketList(data);
            }

            // publishes the data to the matching topic
            if (data.type === 'update' & (data.channel === 'trades' || data.channel === 'ticker')) { 
                console.log(JSON.stringify(data));
                if(data.channel === 'trades') { 
                    //convertDateToEpoch(data.data[0].time);
                    //convertDateToEpoch(data.time_ws);
                    // capture message and save as last received message
                    marketLastMessageList[data.market, data];
                }
                // if no buffer, then publish directly
                if(marketMessageBuffer[data.market] === undefined) {
                    publishMessage(JSON.stringify(data), formatTopicName(data.channel, data.market));
                }
                else {
                    // if buffer is initialized, then add to buffer
                    publishMessageToBuffer(data);
                } 

            }

            //Print message in console
            if(outputMessages)
                console.log("Received: '" + JSON.stringify(data) + "'");
        }
    });
    
    //Send pings every 15 seconds to keep connection alive
    function sendPing() {
        if (connection.connected) {
            connection.send(JSON.stringify({
                op: 'ping'
            }));
            console.log("ping " + new Date(new Date()-3600*1000*3).toISOString());
            setTimeout(sendPing, 15000);
        }
    }
    sendPing();

    //Subscribe to market data channels
    /*
    connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'ticker',
                'market': 'SOL/USD'
            }));
    */
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
    function checkMarketList(marketListData) {

        // null check
        if(marketListData == null || marketListData.data == null || marketListData.data.data == null) 
            return;

        for (const marketKey in marketListData.data.data) {
            console.log("Checking " + marketKey);
            if(handleReconnectBuffers) {
                // initialize with empty array for buffer
                marketMessageBuffer[marketKey,[]];
            }
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
                    sleep(3000);
                    createPubSubTopic(formatTopicName("ticker", marketKey),marketKey);
                    sleep(3000);
                    marketList.push(marketKey);

                    // subscribe - MOVE CALL TO createPubSubTopic
                    //console.log("Subscribing " + marketKey);
                    //subscribeToChannel("ticker", marketKey);
                    //subscribeToChannel("trades", marketKey);
                    //marketSubscribeList.push(marketKey);
                //}
            }
        }


    }


    // formats topic name according to naming convention
    function formatTopicName(channel, market) {

        market = market.replace("/","_");
        var topicName = topic_destination + channel.toLowerCase() + "_" + market.toLowerCase();
        console.log(topicName);
        return topicName;
    }

    //
    // Creates PubSub topic 
    // Once created, it will subscribe to the websocket using the market name
    // If topic already created, then it will just subscribe using the market name
    function createPubSubTopic(topicName, market) {

        try {
            var topic = pubSubClient.topic(topicName);
            topic.exists((err, exists) => {
                if (err) {
                    console.error(`Error looking for specified topic ${topicName}: ${error}`);
                    process.exit(1);
                } else {
                    if (!exists) {
                        console.error(`Topic ${topicName} not found, creating...`);
                        topic.create((err, topic, apiResponse) => {
                            if (err) {
                                console.error(`Could not create non-existent topic ${topicName}: ${apiResponse} ${err}`);
                                //process.exit(1);
                            } else {
                                console.error(`Created topic ${topicName}`);
                                //publishMessages();
                                console.log("Subscribing " + market);
                                subscribeToChannel("ticker", market);
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
            process.exit(1);
        }


    }


    // If buffer enabled, then save messages to buffer
    function publishMessageToBuffer(data) {
        var messageArray = marketMessageBuffer[data.market];
        if(messageArray === undefined) {
            messageArray = [];
            marketMessageBuffer[data.market,messageArray];
        }
        marketMessageBuffer[data.market,messageArray.push(data)];
    }

    function requestMissingTradeData(market) {
        // make a REST API call to retrieve missing data between the 
        // time frames
        var lastMessage = marketLastMessageList[market];
        var startTime = lastMessage.time_ws;
        var messageBufferArray = marketMessageBuffer[market];
        var dataArrayLength = messageBufferArray[0].data.length;
        var endTime = messageBufferArray[0].data[dataArrayLength-1].time;

        var url = "https://ftx.us/api/markets/BTC/USD/trades?start_time=" + startTime + "&end_time=" + endTime;

        got.get(url, {responseType: 'json'})
          .then(res => {
            //const headerDate = res.headers && res.headers.date ? res.headers.date : 'no response date';
            //console.log('Status Code:', res.statusCode);
            //console.log('Date in Response header:', headerDate);

            const content = res.body;
            console.log(JSON.stringify(content));
            parseMissingData(market, content);

          })
          .catch(err => {
            console.log('Error: ', err.message);
          });
    }

    // Iterate through missing data,
    // Compare to first/last records
    // Publish buffer
    // Switch back over to real-time (before publish realtime, double check buffer)
    function parseMissingTradeData(market, tradeData) {

        var lastMessage = marketLastMessageList[market];
        var lastDataId = lastMessage.data[lastMessage.data.length-1].id;
        var messageBufferArray = marketMessageBuffer[market];
        var firstMessage = messageBufferArray[0];
        var firstDataId = firstMessage.data[firstMessage.data.length-1].id;
        var messagesToPublish = [];

        var publishData = false;
        // iterate in reverse order, to get the first messages first
        for(var i=tradeData.result.length-1;i>=0;i--) {
            data = tradeData.result[i];
            if(data.id == lastDataId) {
                publishData = true;
            } else if(data.id == firstDataId) {
                publishData = false;
            } else {
                if(publishData)
                  messagesToPublish.push(data);
            }
        }

        // publish data to topic
        for (const message in messagesToPublish) {
            publishMessage(JSON.stringify(message), formatTopicName(message.channel, market));
        }

        // Remove buffer
        delete marketMessageBuffer[market];
        if(Object.keys(marketMessageBuffer).length == 0) {
            // once all buffers have been cleared
            handleReconnectBuffers = false;
        }

    }

    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }

    // Converts date string to epoch for API call
    function convertDateToEpoch(dateString) {
        var dateEpoch = Math.floor(new Date(dateString).getTime()/1000.0)
        return dateEpoch;
    }


    subscribeToMarketList();
    
});

//Connect to FTX US websocket server
client.connect('wss://ftx.us/ws/', null);