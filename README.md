# websocket-to-pubsub-ingest
The websocket-to-pubsub-ingest adapter provides an easy way to ingest websocket streaming data into Pub/Sub topics in Google Cloud. 

This example uses the websocket service from FTX for market feed data.

 * Subscribe to the market data
 * For each market pair, check if a topic exists for trades and ticker
 * If topic does not exist, then create it
 * Subscribe to the ticker and trade feeds for the market pair
 * For each message received, publish to the topic

## Before you begin

- [Select or create a Cloud Platform project](https://console.cloud.google.com/project?_ga=2.220968858.3275545.1654003980-1401993212.1652797137).
- [Enable billing for your project](https://support.google.com/cloud/answer/6293499#enable-billing).
- [Enable the Google Cloud Pub/Sub API](https://console.cloud.google.com/flows/enableapi?apiid=pubsub.googleapis.com&_ga=2.212587670.3275545.1654003980-1401993212.1652797137).
- [Set up authentication with a service account so you can access the API from your local workstation](https://cloud.google.com/docs/authentication/getting-started).

## Installing required libraries

Install Node.JS version 16 or higher.  Npm is a part of the Node.js 16+ install.
```
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install nodejs

git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
npm install 
```

## Run application

Runtime arguments:
 * websocket-endpoint - The websocket url to connect to
 * topic-prefix - The prefix of the topic that will be created.  Follow the format: "projects/{project-name}/topics/{topic-prefix}"
 * debug - Default is false.  Passing true will log every message
 
```
node index.js {websocket-endpoint} {topic-prefix} {debug}
```
Example
```
node index.js "wss://ftx.us/ws/" "projects/{project-name}/topics/ftx_us_" false
```


