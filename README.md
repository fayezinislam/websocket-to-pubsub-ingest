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

## Before you begin

- [Select or create a Cloud Platform project](https://console.cloud.google.com/project?_ga=2.220968858.3275545.1654003980-1401993212.1652797137).
- [Enable billing for your project](https://support.google.com/cloud/answer/6293499#enable-billing).
- [Enable the Google Cloud Pub/Sub API](https://console.cloud.google.com/flows/enableapi?apiid=pubsub.googleapis.com&_ga=2.212587670.3275545.1654003980-1401993212.1652797137).
- [Set up authentication with a service account so you can access the API from your local workstation](https://cloud.google.com/docs/authentication/getting-started).
- Confirm service account has these roles or equivalent privileges:
  * Cloud Pub/Sub Service Agent
  * Compute Engine Service Agent
  * Compute Instance Admin (v1)
  * Compute Instance Admin (beta)
  * Service Account User

  https://cloud.google.com/iam/docs/impersonating-service-accounts#impersonate-sa-level

- Check on project quotas.  Due to the number of market pair instances that could be created, be aware of the following quotas which could prevent all of the components from being created.  There should be enough allocated to accomodate as many market pairs you want to support. 
  * Compute Engine API
    * In-use IP addresses
    * CPUs
    * Backend services
    * Managed instance groups



## Run as a MIG

A MIG is created from an instance template.  Do the following to create the two instance templates, one for `market list` and one for `market pair`

### Create instance templates (manual)

 * Choose Ubuntu 20.04
 * Create 2 instance templates:
   * market-list-instance-template - this will retrieve all market pairs (or first N market pairs)
   * market-pair-instance-template - this will launch one market pair MIG
 * Set the startup script for the appropriate instance temple.  The startup script will parse the name of the VM to get the market pair


#### Startup script for `market-list-instance-template`
When manually creating `market-list-instance-template`, use this [startup script](market-list-instance-template-startup.sh).  Set the variables to match your environment (project, zone, topic prefix, number of pairs, etc)


#### Create the `market-list-instance-template` instance template 

Create the instance template with the gCloud commands below or through the [console](https://cloud.google.com/compute/docs/instance-templates/create-instance-templates#console)

Substitute the following variables:
 * --service-account
 * --project
 * ZONE
 * WS_URL

```
gcloud compute instance-templates create market-list-instance-template --project=xxxx --machine-type=e2-standard-4 --network-interface=network=default,network-tier=PREMIUM --metadata=^,@^startup-script=echo\ \"Updating\ OS\"$'\n'sudo\ apt\ update\ -y$'\n'sudo\ apt-get\ update\ -y$'\n'sudo\ apt\ install\ curl\ -y$'\n'$'\n'echo\ \"\$PWD\"$'\n'mkdir\ /var/marketfeed$'\n'chmod\ 777\ /var/marketfeed$'\n'cd\ /var/marketfeed$'\n'$'\n'\#\ Install\ agents$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-logging-agent-repo.sh$'\n'sudo\ bash\ add-logging-agent-repo.sh\ --also-install$'\n'$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh$'\n'sudo\ bash\ add-google-cloud-ops-agent-repo.sh\ --also-install$'\n'$'\n'\#\ Update\ log\ settings\ to\ get\ the\ output\ of\ the\ process\ to\ Cloud\ Logging$'\n'sudo\ tee\ /etc/google-fluentd/config.d/subscribeToMarketChannel.conf\ \<\<EOF$'\n'\<source\>$'\n'\ \ \ \ @type\ tail$'\n'\ \ \ \ \<parse\>$'\n'\ \ \ \ \ \ \ \ \#\ \'none\'\ indicates\ the\ log\ is\ unstructured\ \(text\).$'\n'\ \ \ \ \ \ \ \ @type\ none$'\n'\ \ \ \ \</parse\>$'\n'\ \ \ \ \#\ The\ path\ of\ the\ log\ file.$'\n'\ \ \ \ path\ /var/marketfeed/websocket-to-pubsub-ingest/output.log$'\n'\ \ \ \ \#\ The\ path\ of\ the\ position\ file\ that\ records\ where\ in\ the\ log\ file$'\n'\ \ \ \ \#\ we\ have\ processed\ already.\ This\ is\ useful\ when\ the\ agent$'\n'\ \ \ \ \#\ restarts.$'\n'\ \ \ \ pos_file\ /var/lib/google-fluentd/pos/subscribeToMarketChannel-log.pos$'\n'\ \ \ \ read_from_head\ true$'\n'\ \ \ \ \#\ The\ log\ tag\ for\ this\ log\ input.$'\n'\ \ \ \ tag\ unstructured-log$'\n'\</source\>$'\n'EOF$'\n'$'\n'sudo\ service\ google-fluentd\ restart$'\n'$'\n'export\ PROJECT_NAME=\$\(gcloud\ config\ list\ --format\ \'value\(core.project\)\'\)$'\n'export\ ZONE=asia-northeast1-b$'\n'export\ MKT_PAIR_INSTANCE_TEMPLATE=market-pair-instance-template$'\n'export\ WS_URL=\"wss://ftx.com/ws/\"$'\n'export\ TOPIC_PREFIX=\"projects/\$PROJECT_NAME/topics/ftx_com_\"$'\n'export\ DEBUG=false$'\n'$'\n'echo\ \"Variables:\ \$HOST_NAME,\ \$PROJECT_NAME,\ \$ZONE,\ \$MKT_PAIR_INSTANCE_TEMPLATE,\ \$WS_URL,\ \$TOPIC_PREFIX,\ \$DEBUG\"$'\n'$'\n'\#\ Install\ Node.js$'\n'echo\ \"Installing\ Node.js\"$'\n'curl\ -fsSL\ https://deb.nodesource.com/setup_16.x\ \|\ sudo\ -E\ bash\ -$'\n'sudo\ apt-get\ install\ -y\ nodejs$'\n'node\ --version$'\n'npm\ --version$'\n'$'\n'\#\ Install\ program$'\n'echo\ \"Cloning\ repo\"$'\n'git\ clone\ https://github.com/fayezinislam/websocket-to-pubsub-ingest.git$'\n'cd\ websocket-to-pubsub-ingest$'\n'git\ checkout\ market-ticker-trades-split$'\n'$'\n'\#\ Install\ libraries$'\n'echo\ \"Installing\ libraries\"$'\n'npm\ install$'\n'npm\ install\ @google-cloud/pubsub$'\n'npm\ install\ @google-cloud/compute$'\n'npm\ install\ websocket$'\n'$'\n'\#\ Launch\ program$'\n'echo\ \"Launching\ program\"$'\n'nohup\ node\ subscribeToMarketChannel.js\ \$PROJECT_NAME\ \$ZONE\ \$MKT_PAIR_INSTANCE_TEMPLATE\ \$WS_URL\ \$TOPIC_PREFIX\ \$DEBUG\ \>\ output.log\ 2\>\&1\ \&$'\n',@enable-oslogin=true --maintenance-policy=MIGRATE --provisioning-model=STANDARD --service-account=xxxxxx-compute@developer.gserviceaccount.com --scopes=https://www.googleapis.com/auth/cloud-platform --create-disk=auto-delete=yes,boot=yes,device-name=market-list-instance-template2,image=projects/ubuntu-os-cloud/global/images/ubuntu-2004-focal-v20220705,mode=rw,size=50,type=pd-balanced --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring --reservation-affinity=any
```



#### Startup script for `market-pair-instance-template`

Here is the [startup script](market-pair-instance-template-startup.sh), set the variables to match your environment (project, topic prefix, url, etc)



#### Create the `market-pair-instance-template` instance template with gCloud Command 

Substitute the following variable:
 * --service-account
 * --project

```
gcloud compute instance-templates create market-pair-instance-template --project=xxxxxxx --machine-type=e2-standard-4 --network-interface=network=default,network-tier=PREMIUM --metadata=^,@^startup-script=echo\ \"Updating\ OS\"$'\n'sudo\ apt\ update\ -y$'\n'sudo\ apt-get\ update\ -y$'\n'sudo\ apt\ install\ curl\ -y$'\n'$'\n'echo\ \"\$PWD\"$'\n'mkdir\ /var/marketfeed$'\n'chmod\ 777\ /var/marketfeed$'\n'cd\ /var/marketfeed$'\n'$'\n'\#\ Install\ agents$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-logging-agent-repo.sh$'\n'sudo\ bash\ add-logging-agent-repo.sh\ --also-install$'\n'$'\n'curl\ -sSO\ https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh$'\n'sudo\ bash\ add-google-cloud-ops-agent-repo.sh\ --also-install$'\n'$'\n'\#\ Update\ log\ settings\ to\ get\ the\ output\ of\ the\ process\ to\ Cloud\ Logging$'\n'sudo\ tee\ /etc/google-fluentd/config.d/subscribeToMarketPairChannels.conf\ \<\<EOF$'\n'\<source\>$'\n'\ \ \ \ @type\ tail$'\n'\ \ \ \ \<parse\>$'\n'\ \ \ \ \ \ \ \ \#\ \'none\'\ indicates\ the\ log\ is\ unstructured\ \(text\).$'\n'\ \ \ \ \ \ \ \ @type\ none$'\n'\ \ \ \ \</parse\>$'\n'\ \ \ \ \#\ The\ path\ of\ the\ log\ file.$'\n'\ \ \ \ path\ /var/marketfeed/websocket-to-pubsub-ingest/output.log$'\n'\ \ \ \ \#\ The\ path\ of\ the\ position\ file\ that\ records\ where\ in\ the\ log\ file$'\n'\ \ \ \ \#\ we\ have\ processed\ already.\ This\ is\ useful\ when\ the\ agent$'\n'\ \ \ \ \#\ restarts.$'\n'\ \ \ \ pos_file\ /var/lib/google-fluentd/pos/subscribeToMarketPairChannels-log.pos$'\n'\ \ \ \ read_from_head\ true$'\n'\ \ \ \ \#\ The\ log\ tag\ for\ this\ log\ input.$'\n'\ \ \ \ tag\ unstructured-log$'\n'\</source\>$'\n'EOF$'\n'$'\n'sudo\ service\ google-fluentd\ restart$'\n'$'\n'export\ PROJECT_NAME=\$\(gcloud\ config\ list\ --format\ \'value\(core.project\)\'\)$'\n'export\ WS_URL=\"wss://ftx.us/ws/\"$'\n'export\ TOPIC_PREFIX=\"projects/\$PROJECT_NAME/topics/ftx_us_\"$'\n'export\ DEBUG=false$'\n'\#\ Parse\ market\ pair\ from\ hostname$'\n'export\ HOST_NAME=\$HOSTNAME$'\n'$'\n'MARKET_PAIR_STR1=\$\{HOST_NAME:21\}$'\n'MARKET_STR_SEARCH=\"-ig\"$'\n'MARKET_PAIR=\$\{MARKET_PAIR_STR1\%\%\$MARKET_STR_SEARCH\*\}$'\n'MARKET_PAIR=\$\{MARKET_PAIR/-/\\/\}$'\n'export\ MARKET_PAIR=\$\{MARKET_PAIR^^\}$'\n'$'\n'echo\ \"Variables:\ \$HOST_NAME,\ \$MARKET_PAIR,\ \$PROJECT_NAME,\ \$WS_URL,\ \$TOPIC_PREFIX,\ \$DEBUG\"$'\n'$'\n'\#\ Install\ Node.js$'\n'echo\ \"Installing\ Node.js\"$'\n'curl\ -fsSL\ https://deb.nodesource.com/setup_16.x\ \|\ sudo\ -E\ bash\ -$'\n'sudo\ apt-get\ install\ -y\ nodejs$'\n'node\ --version$'\n'npm\ --version$'\n'$'\n'\#\ Install\ program$'\n'echo\ \"Cloning\ repo\"$'\n'git\ clone\ https://github.com/fayezinislam/websocket-to-pubsub-ingest.git$'\n'cd\ websocket-to-pubsub-ingest$'\n'git\ checkout\ market-ticker-trades-split$'\n'$'\n'\#\ Install\ libraries$'\n'echo\ \"Installing\ libraries\"$'\n'npm\ install$'\n'npm\ install\ @google-cloud/pubsub$'\n'npm\ install\ websocket$'\n'$'\n'\#\ Launch\ program$'\n'echo\ \"Launching\ program\"$'\n'nohup\ node\ subscribeToMarketPairChannels.js\ \$MARKET_PAIR\ \$WS_URL\ \$TOPIC_PREFIX\ \$DEBUG\ \>\ output.log\ 2\>\&1\ \&$'\n',@enable-oslogin=true --maintenance-policy=MIGRATE --provisioning-model=STANDARD --service-account=xxxxxxx-compute@developer.gserviceaccount.com --scopes=https://www.googleapis.com/auth/pubsub,https://www.googleapis.com/auth/source.read_only,https://www.googleapis.com/auth/compute.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/trace.append,https://www.googleapis.com/auth/devstorage.read_only --create-disk=auto-delete=yes,boot=yes,device-name=market-pair-instance-template,image=projects/ubuntu-os-cloud/global/images/ubuntu-2004-focal-v20220615,mode=rw,size=10,type=pd-balanced --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring --reservation-affinity=any
```


### Create the MIG

The name of each instance group needs to have the market pair in the name.  Use a naming convention.  Use the gcloud commands below or the [console](https://cloud.google.com/compute/docs/instance-groups/create-zonal-mig#console)

 * subscribe-marketlist-ig

Create the MIG
```
gcloud compute instance-groups managed create subscribe-marketlist-ig --project=$PROJECT_NAME --base-instance-name=subscribe-marketlist-ig --size=1 --template=market-list-instance-template --zone=us-central1-a
```

Create the autoscaling attributes
```
gcloud beta compute instance-groups managed set-autoscaling subscribe-marketlist-ig --project=$PROJECT_NAME --zone=us-central1-a --cool-down-period=60 --max-num-replicas=1 --min-num-replicas=1 --mode=off --target-cpu-utilization=1.0
```

*Note that this MIG will create MIGS for all the market pairs*

 * subscribe-marketpair-btc-usd-ig

**This step is only necessary if you want to create a MIG manually for a specific market pair.  Otherwise, they will all be created by the `subscribe-marketlist-ig` MIG when it starts**

Create the MIG
```
gcloud compute instance-groups managed create subscribe-marketpair-btc-usd-ig --project=$PROJECT_NAME --base-instance-name=subscribe-marketpair-btc-usd-ig --size=1 --template=market-pair-instance-template --zone=us-central1-a
```

Create the autoscaling attributes
```
gcloud beta compute instance-groups managed set-autoscaling subscribe-marketpair-btc-usd-ig --project=$PROJECT_NAME --zone=us-central1-a --cool-down-period=30 --max-num-replicas=1 --min-num-replicas=1 --mode=off --target-cpu-utilization=1.0
```
 
### Test

 * Check if all MIGS have been created: [https://console.cloud.google.com/compute/instanceGroups/list](https://console.cloud.google.com/compute/instanceGroups/list)
 * Check if all PubSub topics have been created: [https://console.cloud.google.com/cloudpubsub/topic/list](https://console.cloud.google.com/cloudpubsub/topic/list)
 * Run the pulltop command to see if messages are getting published to the topic

```
npm install -g pulltop
pulltop projects/$PROJECT_NAME/topics/$TOPIC_NAME
```


## Run in Cloud Run

Cloud Run is typically used for serving data through a webservice or API, so Cloud Run is not a good choice for a program like this.  

## Run in Kubernetes

Coming soon





