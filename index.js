const spawn = require('child_process').spawn
const readline = require('readline')
const express = require('express')
const log = require('winston')
const morgan = require('morgan')
const mqtt = require('mqtt')

const sensorCache = {}
const sensorToInstanceMap = {  // Map rtl_433 'id' field to own sensor instances, see Evernote for instance bindings
  1:   50,
  167: 51,
  2:   52,
}
const MQTT_BROKER = 'mqtt://ha-opi'

startRtl_433()
startHttpServer()
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
    console.log('Failed to parse input line:', line, e)
  }
}

function handleInputJson(json) {
  if(json.model === 'WT450 sensor' || json.model === 'Nexus Temperature/Humidity') {
    handleWT450OrNexus(json)
  } else if(json.model === 'Waveman Switch Transmitter') {
    handleSwitchTransmitter(json)
  } else {
    console.log('Got unknown message', json)
  }
}

function handleWT450OrNexus(json) {
  const instance = sensorToInstanceMap[json.id]
  if(!instance) {
    console.log('No instance mapping for rtl_433 ID', json.id)
    return
  }
  const t = { instance, tag: 't', temperature: json.temperature_C, ts: new Date() }
  const h = { instance, tag: 'h', humidity: json.humidity, ts: new Date() }
  sensorCache[instance] = { t, h }
}

function handleSwitchTransmitter(json) {
  mqttClient.publish(`/switch/intertechno/${json.id}/${json.channel}/${json.button}/state`, json.state.toUpperCase(), { retain: true, qos: 1 })
}



////  HTTP server to provide parsed sensor data

function startHttpServer() {
  const app = express()
  app.use(morgan('combined'))

  app.get('/sensor/:instance/:tag', (req, res) => {
    if(sensorCache[req.params.instance] && sensorCache[req.params.instance][req.params.tag]) {
      res.json(sensorCache[req.params.instance][req.params.tag]).end()
    } else {
      res.status(404).end()
    }
  })

  app.listen(3000, function() {
    log.info('rtl_433 sensor receiver listening on port 3000')
  })
}



////  MQTT client for publishing events about RF switches

function startMqttClient(brokerUrl) {
  const client = mqtt.connect(brokerUrl)
  client.on('connect', function () {
    console.log("Connected to MQTT server..")
  })
  return client
}