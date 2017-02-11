const spawn = require('child_process').spawn
const readline = require('readline')
const express = require('express')
const log = require('winston')
const morgan = require('morgan')

const sensorCache = {}
const sensorToInstanceMap = {  // Map rtl_433 'id' field to own sensor instances, see Evernote for instance bindings
  1: 50,
  167: 51
}

startRtl_433()
startHttpServer()



////  Sensor data parsing from rtl_433 output

function startRtl_433() {
  const rtl_433 = spawn('rtl_433', ['-l', '12000', '-F', 'json', '-R', '4', '-R', '33', '-R', '19'])
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



////  HTTP server to provide parsed sensor data

function startHttpServer(latestSensorValues) {
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
