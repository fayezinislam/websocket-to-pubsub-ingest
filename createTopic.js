#! /usr/bin/env node

//
// createTopic

const { PubSub } = require('@google-cloud/pubsub');
const pubsub = new PubSub();
let topic = undefined;
let topicName = process.argv[2];

try {
    topic = pubsub.topic(topicName);
    topic.exists((err, exists) => {
        if (err) {
            console.error(`Error looking for specified topic ${topicName}: ${error}`);
            process.exit(1);
        } else {
            if (!exists) {
                console.error(`Topic ${topicName} not found, creating...`);
                topic.create((err, topic, apiResponse) => {
                    if (err) {
                        console.error(`Could not create non-existent topic ${topicName}: ${apiResponse} ${err}`);
                        process.exit(1);
                    } else {
                        console.error(`Created topic ${topicName}`);
                        //publishMessages();
                    }
                });
            } else {
                // do nothing for now
                console.log("Topic exists");
            }
        }
    });
} catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
}
