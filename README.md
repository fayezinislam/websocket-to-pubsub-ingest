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
node --version
npm --version
npm install
npm install @google-cloud/pubsub
npm install websocket
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

## Run as a MIG

### Create instance templates

 * Choose Ubuntu 20.04
 * Create 2 instance templates:
   * market-list-instance-template
   * market-pair-instance-template 
 * Set the startup script for the appropriate instance temple.  The startup script will parse the name of the VM to get the market pair


#### Startup script for `market-list-instance-template`

```
echo "Updating OS"
sudo apt update -y
sudo apt-get update -y
sudo apt install curl -y

echo "$PWD"
mkdir /var/marketfeed
chmod 777 /var/marketfeed
cd /var/marketfeed

# Install agents
curl -sSO https://dl.google.com/cloudagents/add-logging-agent-repo.sh
sudo bash add-logging-agent-repo.sh --also-install

curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install

# Update log settings to get the output of the process to Cloud Logging
sudo tee /etc/google-fluentd/config.d/subscribeToMarketChannel.conf <<EOF
<source>
    @type tail
    <parse>
        # 'none' indicates the log is unstructured (text).
        @type none
    </parse>
    # The path of the log file.
    path /var/marketfeed/websocket-to-pubsub-ingest/output.log
    # The path of the position file that records where in the log file
    # we have processed already. This is useful when the agent
    # restarts.
    pos_file /var/lib/google-fluentd/pos/subscribeToMarketChannel-log.pos
    read_from_head true
    # The log tag for this log input.
    tag unstructured-log
</source>
EOF

sudo service google-fluentd restart

export PROJECT_NAME=$(gcloud config list --format 'value(core.project)')
export WS_URL="wss://ftx.us/ws/"
export TOPIC_PREFIX="projects/$PROJECT_NAME/topics/ftx_us_"
export DEBUG=false

echo "Variables: $HOST_NAME, $PROJECT_NAME, $WS_URL, $TOPIC_PREFIX, $DEBUG"

# Install Node.js
echo "Installing Node.js"
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

# Install program
echo "Cloning repo"
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
git checkout market-ticker-trades-split

# Install libraries
echo "Installing libraries"
npm install
npm install @google-cloud/pubsub
npm install @google-cloud/compute
npm install websocket

# Launch program
echo "Launching program"
nohup node subscribeToMarketChannel.js $WS_URL $TOPIC_PREFIX $DEBUG > output.log 2>&1 &
```

#### Create the `market-pair-instance-template` instance template with gCloud Command 

Substitute the following variable:
 * --service-account

```

```



#### Startup script for `market-pair-instance-template`

```
echo "Updating OS"
sudo apt update -y
sudo apt-get update -y
sudo apt install curl -y

echo "$PWD"
mkdir /var/marketfeed
chmod 777 /var/marketfeed
cd /var/marketfeed

# Install agents
curl -sSO https://dl.google.com/cloudagents/add-logging-agent-repo.sh
sudo bash add-logging-agent-repo.sh --also-install

curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
sudo bash add-google-cloud-ops-agent-repo.sh --also-install

# Update log settings to get the output of the process to Cloud Logging
sudo tee /etc/google-fluentd/config.d/subscribeToMarketPairChannels.conf <<EOF
<source>
    @type tail
    <parse>
        # 'none' indicates the log is unstructured (text).
        @type none
    </parse>
    # The path of the log file.
    path /var/marketfeed/websocket-to-pubsub-ingest/output.log
    # The path of the position file that records where in the log file
    # we have processed already. This is useful when the agent
    # restarts.
    pos_file /var/lib/google-fluentd/pos/subscribeToMarketPairChannels-log.pos
    read_from_head true
    # The log tag for this log input.
    tag unstructured-log
</source>
EOF

sudo service google-fluentd restart

export PROJECT_NAME=$(gcloud config list --format 'value(core.project)')
export WS_URL="wss://ftx.us/ws/"
export TOPIC_PREFIX="projects/$PROJECT_NAME/topics/ftx_us_"
export DEBUG=false
# Parse market pair from hostname
export HOST_NAME=$HOSTNAME

MARKET_PAIR_STR1=${HOST_NAME:21}
MARKET_STR_SEARCH="-ig"
MARKET_PAIR=${MARKET_PAIR_STR1%%$MARKET_STR_SEARCH*}
MARKET_PAIR=${MARKET_PAIR/-/\/}
export MARKET_PAIR=${MARKET_PAIR^^}

echo "Variables: $HOST_NAME, $MARKET_PAIR, $PROJECT_NAME, $WS_URL, $TOPIC_PREFIX, $DEBUG"

# Install Node.js
echo "Installing Node.js"
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

# Install program
echo "Cloning repo"
git clone https://github.com/fayezinislam/websocket-to-pubsub-ingest.git
cd websocket-to-pubsub-ingest
git checkout market-ticker-trades-split

# Install libraries
echo "Installing libraries"
npm install
npm install @google-cloud/pubsub
npm install websocket

# Launch program
echo "Launching program"
nohup node subscribeToMarketPairChannels.js $MARKET_PAIR $WS_URL $TOPIC_PREFIX $DEBUG > output.log 2>&1 &
```


#### Create the `market-pair-instance-template` instance template with gCloud Command 

Substitute the following variable:
 * --service-account

```
gcloud compute instance-templates create market-pair-instance-template --project=ftx-streaming-demo --machine-type=e2-standard-4 --network-interface=network=default,network-tier=PREMIUM --metadata=^,@^startup-script=echo\ \"Updating\ OS\"$'\n'sudo\ apt\ update\ -y$'\n'sudo\ apt-get\ update\ -y$'\n'sudo\ apt\ install\ curl\ -y$'\n'$'\n'echo\ \"\$PWD\"$'\n'mkdir\ /var/marketfeed$'\n'chmod\ 777\ /var/marketfeed$'\n'cd\ /var/marketfeed$'\n'$'\n'\#\ Install\ agents$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-logging-agent-repo.sh$'\n'sudo\ bash\ add-logging-agent-repo.sh\ --also-install$'\n'$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh$'\n'sudo\ bash\ add-google-cloud-ops-agent-repo.sh\ --also-install$'\n'$'\n'\#\ Update\ log\ settings\ to\ get\ the\ output\ of\ the\ process\ to\ Cloud\ Logging$'\n'sudo\ tee\ /etc/google-fluentd/config.d/subscribeToMarketPairChannels.conf\ \<\<EOF$'\n'\<source\>$'\n'\ \ \ \ @type\ tail$'\n'\ \ \ \ \<parse\>$'\n'\ \ \ \ \ \ \ \ \#\ \'none\'\ indicates\ the\ log\ is\ unstructured\ \(text\).$'\n'\ \ \ \ \ \ \ \ @type\ none$'\n'\ \ \ \ \</parse\>$'\n'\ \ \ \ \#\ The\ path\ of\ the\ log\ file.$'\n'\ \ \ \ path\ /var/marketfeed/websocket-to-pubsub-ingest/output.log$'\n'\ \ \ \ \#\ The\ path\ of\ the\ position\ file\ that\ records\ where\ in\ the\ log\ file$'\n'\ \ \ \ \#\ we\ have\ processed\ already.\ This\ is\ useful\ when\ the\ agent$'\n'\ \ \ \ \#\ restarts.$'\n'\ \ \ \ pos_file\ /var/lib/google-fluentd/pos/subscribeToMarketPairChannels-log.pos$'\n'\ \ \ \ read_from_head\ true$'\n'\ \ \ \ \#\ The\ log\ tag\ for\ this\ log\ input.$'\n'\ \ \ \ tag\ unstructured-log$'\n'\</source\>$'\n'EOF$'\n'$'\n'sudo\ service\ google-fluentd\ restart$'\n'$'\n'export\ PROJECT_NAME=\$\(gcloud\ config\ list\ --format\ \'value\(core.project\)\'\)$'\n'export\ WS_URL=\"wss://ftx.us/ws/\"$'\n'export\ TOPIC_PREFIX=\"projects/\$PROJECT_NAME/topics/ftx_us_\"$'\n'export\ DEBUG=false$'\n'\#\ Parse\ market\ pair\ from\ hostname$'\n'export\ HOST_NAME=\$HOSTNAME$'\n'$'\n'MARKET_PAIR_STR1=\$\{HOST_NAME:21\}$'\n'MARKET_STR_SEARCH=\"-ig\"$'\n'MARKET_PAIR=\$\{MARKET_PAIR_STR1\%\%\$MARKET_STR_SEARCH\*\}$'\n'MARKET_PAIR=\$\{MARKET_PAIR/-/\\/\}$'\n'export\ MARKET_PAIR=\$\{MARKET_PAIR^^\}$'\n'$'\n'echo\ \"Variables:\ \$HOST_NAME,\ \$MARKET_PAIR,\ \$PROJECT_NAME,\ \$WS_URL,\ \$TOPIC_PREFIX,\ \$DEBUG\"$'\n'$'\n'\#\ Install\ Node.js$'\n'echo\ \"Installing\ Node.js\"$'\n'curl\ -fsSL\ https://deb.nodesource.com/setup_16.x\ \|\ sudo\ -E\ bash\ -$'\n'sudo\ apt-get\ install\ -y\ nodejs$'\n'node\ --version$'\n'npm\ --version$'\n'$'\n'\#\ Install\ program$'\n'echo\ \"Cloning\ repo\"$'\n'git\ clone\ https://github.com/fayezinislam/websocket-to-pubsub-ingest.git$'\n'cd\ websocket-to-pubsub-ingest$'\n'git\ checkout\ market-ticker-trades-split$'\n'$'\n'\#\ Install\ libraries$'\n'echo\ \"Installing\ libraries\"$'\n'npm\ install$'\n'npm\ install\ @google-cloud/pubsub$'\n'npm\ install\ websocket$'\n'$'\n'\#\ Launch\ program$'\n'echo\ \"Launching\ program\"$'\n'nohup\ node\ subscribeToMarketPairChannels.js\ \$MARKET_PAIR\ \$WS_URL\ \$TOPIC_PREFIX\ \$DEBUG\ \>\ output.log\ 2\>\&1\ \&$'\n',@enable-oslogin=true --maintenance-policy=MIGRATE --provisioning-model=STANDARD --service-account=xxxxxxx-compute@developer.gserviceaccount.com --scopes=https://www.googleapis.com/auth/pubsub,https://www.googleapis.com/auth/source.read_only,https://www.googleapis.com/auth/compute.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/trace.append,https://www.googleapis.com/auth/devstorage.read_only --create-disk=auto-delete=yes,boot=yes,device-name=market-pair-instance-template,image=projects/ubuntu-os-cloud/global/images/ubuntu-2004-focal-v20220615,mode=rw,size=10,type=pd-balanced --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring --reservation-affinity=any
```


### Create the MIG

The name of each instance group needs to have the market pair in the name.  Use a naming convention.

 * subscribe-marketlist-ig

Create the MIG
```

```

Create the autoscaling attributes
```

```


 * subscribe-marketpair-btc-usd-ig

Create the MIG
```
gcloud compute instance-groups managed create subscribe-marketpair-btc-usd-ig --project=ftx-streaming-demo --base-instance-name=subscribe-marketpair-btc-usd-ig --size=1 --template=market-pair-instance-template --zone=us-central1-a
```

Create the autoscaling attributes
```
gcloud beta compute instance-groups managed set-autoscaling subscribe-marketpair-btc-usd-ig --project=ftx-streaming-demo --zone=us-central1-a --cool-down-period=30 --max-num-replicas=1 --min-num-replicas=1 --mode=on --target-cpu-utilization=0.9
```
 
### Test

 * Check if all MIGS have been created: [https://console.cloud.google.com/compute/instanceGroups/list](https://console.cloud.google.com/compute/instanceGroups/list)
 * Check if all PubSub topics have been created: [https://console.cloud.google.com/cloudpubsub/topic/list](https://console.cloud.google.com/cloudpubsub/topic/list)
 * Run the pulltop command to see if messages are getting published to the topic

   `pulltop projects/$PROJECT_NAME/topics/ftx_us_ticker_btc_usd`
   `pulltop projects/$PROJECT_NAME/topics/ftx_us_trades_btc_usd`


## Run in Cloud Run

Cloud Run is typically used for serving data through a webservice or API, so Cloud Run is not a good choice for a program like this.  

## Run in Kubernetes

Coming soon





