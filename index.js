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
const {PubSub} = require('@google-cloud/pubsub');

//Define destination topics
const topic_trades_btc_usd = 'projects/fsi-select-demo/topics/ftx_trades_btc_usd';
const topic_trades_eth_usd = 'projects/fsi-select-demo/topics/ftx_trades_eth_usd';
const topic_trades_sol_usd = 'projects/fsi-select-demo/topics/ftx_trades_sol_usd';
const topic_ticker_btc_usd = 'projects/fsi-select-demo/topics/ftx_ticker_btc_usd';
const topic_ticker_eth_usd = 'projects/fsi-select-demo/topics/ftx_ticker_eth_usd';
const topic_ticker_sol_usd = 'projects/fsi-select-demo/topics/ftx_ticker_sol_usd';

// Creates a Pub/Sub API client; cache this for further use
const pubSubClient = new PubSub();

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
      process.exitCode = 1;
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
var WebSocketClient = require('websocket').client;
var client = new WebSocketClient();

//On connection failure log error to console
client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

//Define actions for succsscul connection
client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });
    connection.on('close', function() {
        console.log('Connection Closed. Attempting to reconnect...');
        client.connect('wss://ftx.us/ws/', null);
    });
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            //Parse JSON message & add receive timestamp
            var data = JSON.parse(message.utf8Data);
            data.time_ws = getTimestamp();

            //Publish trades channel messages to their topics
            if (data.type === 'update' & data.channel === 'trades' & data.market === 'BTC/USD')
                publishMessage(JSON.stringify(data), topic_trades_btc_usd);
            if (data.type === 'update' & data.channel === 'trades' & data.market === 'ETH/USD')
                publishMessage(JSON.stringify(data), topic_trades_eth_usd);
            if (data.type === 'update' & data.channel === 'trades' & data.market === 'SOL/USD')
                publishMessage(JSON.stringify(data), topic_trades_sol_usd);

            //Publish ticker channel messages to their topics
            if (data.type === 'update' & data.channel === 'ticker' & data.market === 'BTC/USD')
                publishMessage(JSON.stringify(data), topic_ticker_btc_usd);
            if (data.type === 'update' & data.channel === 'ticker' & data.market === 'ETH/USD')
                publishMessage(JSON.stringify(data), topic_ticker_eth_usd);
            if (data.type === 'update' & data.channel === 'ticker' & data.market === 'SOL/USD')
                publishMessage(JSON.stringify(data), topic_ticker_sol_usd);
            
            //Print message in console
            console.log("Received: '" + JSON.stringify(data) + "'");
        }
    });
    
    //Send pings every 15 seconds to keep connection alive
    function sendPing() {
        if (connection.connected) {
            connection.send(JSON.stringify({
                op: 'ping'
            }));
            setTimeout(sendPing, 15000);
        }
    }
    sendPing();

    //Subscribe to market data channels
    function subscribe() {
        if (connection.connected) {
            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'trades',
                'market': 'BTC/USD'
            }));

            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'trades',
                'market': 'ETH/USD'
            }));

            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'trades',
                'market': 'SOL/USD'
            }));

            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'ticker',
                'market': 'BTC/USD'
            }));

            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'ticker',
                'market': 'ETH/USD'
            }));

            connection.send(JSON.stringify({
                'op': 'subscribe',
                'channel': 'ticker',
                'market': 'SOL/USD'
            }));
        
        }
    }
    subscribe();
    
});
//Connect to FTX US websocket server
client.connect('wss://ftx.us/ws/', null);