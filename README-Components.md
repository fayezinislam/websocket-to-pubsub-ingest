# websocket-to-pubsub-ingest
The websocket-to-pubsub-ingest adapter provides an easy way to ingest websocket streaming data into Pub/Sub topics in Google Cloud. 


## How it works

There are 2 components, a `market list` component and a `market pair` component.  

<Diagram here>

 * marketlist - The `market list` component will connect to the websocket, subscribe to the market channel, and retrieve a list of market pairs.  For each market pair, it will launch a `market pair` component.  It will remain connected to the websocket.  When a new market pair comes on line, it will notice it and launch a `market pair` component for the new pair.
   * Components
     * Script: startup script and subscribeToMarketChannel.js
     * Instance template: `market-list-instance-template`
     * Instance group: subscribe-marketlist-ig

 * marketpair - One `market pair` component is launched per market pair.  It will connect to the websocket, subscribe to the ticker, trades and orderbook channels for that marketpair, and then publish each message to a matching PubSub topic. If the topic does not exist for the market pair and channel, it will create one before publishing to it.  
   * Components
     * Script: startup script and subscribeToMarketPairChannels.js
     * Instance template: `market-pair-instance-template`
     * Instance group: subscribe-marketpair-{market-pair}-ig (example: subscribe-marketpair-btc-usd-ig)


## Installing required libraries

```
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
node --version
npm --version
npm install
npm install @google-cloud/pubsub
npm install @google-cloud/compute
npm install websocket
```


## Usage

subscribeToMarketChannel.js {project-name} {zone} {template-name} {websocket-url} {topic-prefix} {market-pair-list-limit} {debug}
 - Connects to the websocket service
 - Subscribes to the market feed
 - Retrieves list of market pairs
 - For each pair, launches a separate process (subscribeToMarketPairChannels.js)
   - There are several options to how the separate process is launched
     - Separate nodejs process
     - Docker container
     - MIG
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
node subscribeToMarketChannel.js "$PROJECT_NAME" "asia-northeast1-b" "market-pair-instance-template" "wss://ftx.com/ws/" "projects/$PROJECT_NAME/topics/ftx_com_" -1 false
```
```
node subscribeToMarketPairChannels.js "BTC/USD" "wss://ftx.com/ws/" "projects/$PROJECT_NAME/topics/ftx_com_" false
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
docker run --rm --name market-pair-btc-usd market-pair-channels "BTC/USD" "wss://ftx.com/ws/" "projects/$PROJECT_NAME/topics/ftx_com_" false
```

### Run in background mode
```
export PROJECT_NAME={project-name}
docker run -d --rm --name market-pair-btc-usd market-pair-channels "BTC/USD" "wss://ftx.com/ws/" "projects/$PROJECT_NAME/topics/ftx_com_" false
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



