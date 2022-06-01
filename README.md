# websocket-to-pubsub-ingest
The websocket-to-pubsub-ingest adapter provides an easy way to ingest websocket streaming data into Pub/Sub topics in Google Cloud. 

## Before you begin

- [Select or create a Cloud Platform project](https://console.cloud.google.com/project?_ga=2.220968858.3275545.1654003980-1401993212.1652797137).
- [Enable billing for your project](https://support.google.com/cloud/answer/6293499#enable-billing).
- [Enable the Google Cloud Pub/Sub API](https://console.cloud.google.com/flows/enableapi?apiid=pubsub.googleapis.com&_ga=2.212587670.3275545.1654003980-1401993212.1652797137).
- [Set up authentication with a service account so you can access the API from your local workstation](https://cloud.google.com/docs/authentication/getting-started).

## Installing required libraries
```
sudo apt install nodejs
sudo apt install npm
npm install @google-cloud/pubsub
npm install websocket
```

## Run application
```
node index.js
```
