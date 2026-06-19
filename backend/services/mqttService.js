import mqtt from 'mqtt';
import { Node } from '../models/Node.js';
export const initMqtt = () => {
  const client = mqtt.connect(process.env.MQTT_BROKER);
  client.on('connect', () => {
    console.log('Connected to MQTT Broker');
    client.subscribe(process.env.MQTT_TOPIC);
  });
  client.on('message', async (topic, message) => {
    try {
      const data = JSON.parse(message.toString());
      await Node.findOneAndUpdate(
        { node_id: data.node_id },
        { ...data, timestamp: new Date(data.timestamp) },
        { upsert: true, new: true }
      );
    } catch (error) { console.error('MQTT Error:', error.message); }
  });
};