FTX Logs/Monitoring

Logging
 - VM

Config file

/etc/google-cloud-ops-agent/config.yaml

logging:
  receivers:
    syslog:
      type: files
      include_paths:
      - /var/log/messages
      - /var/log/syslog

    marketFeedLog:
      type: files

      include_paths: [/var/marketfeed/websocket-to-pubsub-ingest/output.log]
      record_log_file_path: true

    journalLog:
      type: systemd_journald

  service:
    pipelines:
      logging_pipeline:
        receivers:
        - syslog
        - journalLog
        - marketFeedLog

metrics:
  receivers:
    hostmetrics:
      type: hostmetrics
      collection_interval: 60s
  processors:
    metrics_filter:
      type: exclude_metrics
      metrics_pattern: []
  service:
    pipelines:
      default_pipeline:
        receivers: [hostmetrics]
        processors: [metrics_filter]


sudo systemctl stop google-cloud-ops-agent
sudo systemctl start google-cloud-ops-agent
sudo systemctl status google-cloud-ops-agent

If error
sudo journalctl -xe | grep "google_cloud_ops_agent_engine"



nohup node subscribeToMarketPairChannels.js $MARKET_PAIR $WS_URL $TOPIC_PREFIX $DEBUG > output.log 2>&1 &


Monitoring

https://medium.com/google-cloud/google-cloud-pub-sub-how-to-monitor-the-health-of-your-subscription-for-optimal-end-to-end-latency-540b868e7929

https://medium.com/google-cloud/google-cloud-pub-sub-reliability-user-guide-part-1-publishing-12577b9069fd

https://cloud.google.com/pubsub/docs/monitoring

Set alerts for PubSub

Alerts








