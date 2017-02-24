const spawn = require('child_process').spawn
const readline = require('readline')
const log = require('winston')
const mqtt = require('mqtt')

const sensorToInstanceMap = {  // Map rtl_433 'id' field to own sensor instances, see Evernote for instance bindings
  1:   50,
  167: 51,
  2:   52,
  3:   53
}
const MQTT_BROKER = 'mqtt://mqtt-home.chacal.online'

startRtl_433()
const mqttClient = startMqttClient(MQTT_BROKER)



////  Sensor data parsing from rtl_433 output

function startRtl_433() {
  const rtl_433 = spawn('rtl_433', ['-s', '1000000', '-F', 'json', '-R', '4', '-R', '33', '-R', '19'])
  const stdout = readline.createInterface({input: rtl_433.stdout})
  stdout.on('line', handleLine)
}

function handleLine(line) {
  try {
    const json = JSON.parse(line)
    handleInputJson(json)
  } catch(e) {
    log.info('Failed to parse input line:', line, e)
  }
}

function handleInputJson(json) {
  if(json.model === 'WT450 sensor' || json.model === 'Nexus Temperature/Humidity') {
    handleWT450OrNexus(json)
  } else if(json.model === 'Waveman Switch Transmitter') {
    handleSwitchTransmitter(json)
  } else {
    log.warn('Got unknown message', json)
  }
}

function handleWT450OrNexus(json) {
  const instance = sensorToInstanceMap[json.id]
  if(!instance) {
    log.warn('No instance mapping for rtl_433 ID', json.id)
    return
  }
  mqttClient.publish(`/sensor/${instance}/t/state`, JSON.stringify({ instance, tag: 't', temperature: json.temperature_C, ts: new Date() }), { retain: true })
  mqttClient.publish(`/sensor/${instance}/h/state`, JSON.stringify({ instance, tag: 'h', humidity: json.humidity, ts: new Date() }), { retain: true })
}

function handleSwitchTransmitter(json) {
  mqttClient.publish(`/switch/intertechno/${json.id.toLowerCase()}/${json.channel}/${json.button}/state`, json.state.toUpperCase(), { retain: true })
}



////  MQTT client for publishing events about detected events

function startMqttClient(brokerUrl) {
  const client = mqtt.connect(brokerUrl, { queueQoSZero : false })
  client.on('connect', () => log.info("Connected to MQTT server"))
  client.on('offline', () => log.info('Disconnected from MQTT server'))
  client.on('error', () => log.error('MQTT client error', e))
  return client
}