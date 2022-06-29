# websocket-to-pubsub-ingest
The websocket-to-pubsub-ingest adapter provides an easy way to ingest websocket streaming data into Pub/Sub topics in Google Cloud. 

This example uses the websocket service from FTX for market feed data.

## Before you begin

- [Select or create a Cloud Platform project](https://console.cloud.google.com/project?_ga=2.220968858.3275545.1654003980-1401993212.1652797137).
- [Enable billing for your project](https://support.google.com/cloud/answer/6293499#enable-billing).
- [Enable the Google Cloud Pub/Sub API](https://console.cloud.google.com/flows/enableapi?apiid=pubsub.googleapis.com&_ga=2.212587670.3275545.1654003980-1401993212.1652797137).
- [Set up authentication with a service account so you can access the API from your local workstation](https://cloud.google.com/docs/authentication/getting-started).

## Installing required libraries

```
sudo apt install nodejs
sudo apt install npm
npm install
```

## Usage

subscribeToMarketChannel.js {websocket-url} {topic-prefix} {debug}
 - Connects to the websocket service
 - Subscribes to the market feed
 - Retrieves list of market pairs
 - For each pair, launches a separate service (subscribeToMarketPairChannels.js)

subscribeToMarketPairChannels.js {market-pair} {websocket-url} {topic-prefix} {debug}
 - Note: This can be run separately, but meant to be called by subscribeToMarketChannel.js
 - Connects to the websocket service
 - Checks if the PubSub topic exists for the market pair for both ticker and trades
 - If it does not, then it creates the topic
 - Subscribe to the ticker and trades feed for the market pair
 - For each message it receives from the websocket, publish it to the respective topic

## Run application
```
node subscribeToMarketChannel.js "wss://ftx.us/ws/" "projects/{project-name}/topics/ftx_us_" false
```
```
node subscribeToMarketPairChannels.js "BTC/USD" "wss://ftx.us/ws/" "projects/{project-name}/topics/ftx_us_" false
```

## Containerization

Build the docker container

docker build -t subscribeToMarketPairChannels .
docker run --rm subscribeToMarketPairChannels

## Run in Kubernetes





