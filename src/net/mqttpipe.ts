import mqtt from 'mqtt';
import { type Pipe, sha256Hex } from './pipe';

export const DEFAULT_MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

/** Same idea as the Nostr pipe, over public MQTT-over-WebSocket brokers. */
export function createMqttPipe(code: string, urls: string[] = DEFAULT_MQTT_BROKERS): Pipe {
  const clients: mqtt.MqttClient[] = [];
  let topic = '';
  let closed = false;
  const pipe: Pipe = {
    onData: null,
    ready: undefined as unknown as Promise<void>,
    send(data) {
      for (const c of clients) if (c.connected) c.publish(topic, data, { qos: 0 });
    },
    close() {
      closed = true;
      for (const c of clients) c.end(true);
    },
  };
  pipe.ready = new Promise<void>((resolve, reject) => {
    void sha256Hex(`aow-mqtt-data|${code}`).then((h) => {
      topic = `age-of-war-p2p/v1/${h.slice(0, 32)}`;
      let opened = false;
      for (const u of urls) {
        try {
          const c = mqtt.connect(u, {
            reconnectPeriod: 3000,
            connectTimeout: 10000,
            clientId: `aow_${Math.random().toString(16).slice(2, 12)}`,
            keepalive: 30,
          });
          clients.push(c);
          c.on('connect', () => {
            c.subscribe(topic, { qos: 0 });
            if (!opened && !closed) {
              opened = true;
              resolve();
            }
          });
          c.on('message', (_t, payload) => pipe.onData?.(payload.toString()));
          c.on('error', () => {});
        } catch {
          /* bad URL */
        }
      }
      setTimeout(() => !opened && reject(new Error('no MQTT broker reachable')), 20000);
    });
  });
  return pipe;
}
