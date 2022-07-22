
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
export ZONE=asia-northeast1-b
export MKT_PAIR_INSTANCE_TEMPLATE=market-pair-instance-template
export WS_URL="wss://ftx.com/ws/"
export TOPIC_PREFIX="projects/$PROJECT_NAME/topics/ftx_com_"
export MKT_PAIR_LIST_LIMIT=5
export DEBUG=false

echo "Variables: $HOST_NAME, $PROJECT_NAME, $ZONE, $MKT_PAIR_INSTANCE_TEMPLATE, $WS_URL, $TOPIC_PREFIX, $MKT_PAIR_LIST_LIMIT, $DEBUG"

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
nohup node subscribeToMarketChannel.js $PROJECT_NAME $ZONE $MKT_PAIR_INSTANCE_TEMPLATE $WS_URL $TOPIC_PREFIX $MKT_PAIR_LIST_LIMIT $DEBUG > output.log 2>&1 &
