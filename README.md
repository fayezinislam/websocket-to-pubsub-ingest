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
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install nodejs -y
node --version
npm --version
npm install
```


## Usage

subscribeToMarketChannel.js {websocket-url} {topic-prefix} {debug}
 - Connects to the websocket service
 - Subscribes to the market feed
 - Retrieves list of market pairs
 - For each pair, launches a separate process (subscribeToMarketPairChannels.js)
   - There are several options to how the separate process is launched
     - Separate nodejs process
     - Docker container
     - Kubernetes pod
     - See the function launchExternalProcess() for more details

subscribeToMarketPairChannels.js {market-pair} {websocket-url} {topic-prefix} {debug}
 - Note: This can be run separately, but meant to be called by subscribeToMarketChannel.js
 - Connects to the websocket service
 - Checks if the PubSub topic exists for the market pair for both ticker and trades
 - If it does not, then it creates the topic
 - Subscribe to the ticker and trades feed for the market pair
 - For each message it receives from the websocket, publish it to the respective topic

## Run application

If launching the sub-processes for each market pair with docker, first build Docker container `market-pair-channels` using instructions below.  This will launch the market-pair-channels container for each market pair.  If launching with node.js process, it will spin off subscribeToMarketPairChannels.js directly.

```
node subscribeToMarketChannel.js "wss://ftx.us/ws/" "projects/$PROJECT_NAME/topics/ftx_us_" false
```
```
node subscribeToMarketPairChannels.js "BTC/USD" "wss://ftx.us/ws/" "projects/$PROJECT_NAME/topics/ftx_us_" false
```

## Containerization

Build the docker container.
```
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
git checkout market-ticker-trades-split 
```

### Build one for market channel and the second for market pair channels
```
docker build -t market-channel -f Dockerfile-MarketChannel .
docker build -t market-pair-channels -f Dockerfile-MarketPairChannels .
docker images
```

### Run in foreground mode
```
export PROJECT_NAME={project-name}
docker run --rm --name market-pair-btc-usd market-pair-channels "BTC/USD" "wss://ftx.us/ws/" "projects/$PROJECT_NAME/topics/ftx_us_" false
```

### Run in background mode
```
export PROJECT_NAME={project-name}
docker run -d --rm --name market-pair-btc-usd market-pair-channels "BTC/USD" "wss://ftx.us/ws/" "projects/$PROJECT_NAME/topics/ftx_us_" false
```

### Docker commands

```
docker ps -a

docker kill {container-name}

docker kill $(docker ps -q)

docker logs {container-id}
```

### Publish container to Artifact Registry

```
gcloud artifacts repositories create marketfeed-images --repository-format=docker \
--location=us-central1 --description="Market feed docker images"

gcloud auth configure-docker us-central1-docker.pkg.dev

sudo docker tag market-pair-channels:latest us-central1-docker.pkg.dev/$PROJECT_NAME/marketfeed-images/market-pair-channels:latest

sudo docker push us-central1-docker.pkg.dev/$PROJECT_NAME/marketfeed-images/market-pair-channels:latest

The container is available at: `us-central1-docker.pkg.dev/$PROJECT_NAME/marketfeed-images/market-pair-channels`
```

#### If you get an authenticate error when pushing, try the following.  Also, confirm that the service account has access to the registry.

```
sudo docker logout
sudo rm /root/.docker/config.json
rm /home/$USER/.docker/config.json

sudo gcloud auth configure-docker us-central1-docker.pkg.dev

sudo gcloud artifacts repositories list
```


## Run in Kubernetes





