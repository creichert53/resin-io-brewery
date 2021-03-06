var _ = require('lodash')
var CronJob = require('cron').CronJob
var timeFormat = require('../src/helpers/hhmmss')
var NoAction = require('./steps/NoAction')
var Heat = require('./steps/Heat')
var Chill = require('./steps/Chill')
var Rest = require('./steps/Rest')
var RestAndConfirm = require('./steps/RestAndConfirm')
var Boil = require('./steps/Boil')
var get = require('lodash/get')
var dbFunctions = require('./database/functions')

// function that holds the overall time string
function Time() {
  this.resetTime = () => {
    this.totalTime = '00:00:00'
    this.stepTime = null
    this.remainingTime = null
  }
  this.resetTime()

  this.setTotalTime = (time) => { this.totalTime = !time && time !== 0 ? null : timeFormat.fromS(time, 'hh:mm:ss') }
  this.setStepTime = (time) => { this.stepTime = !time && time !== 0 ? null : timeFormat.fromS(time, 'hh:mm:ss') }
  this.setRemainingTime = (time) => { this.remainingTime = !time && time !== 0 ? null : timeFormat.fromS(time, 'hh:mm:ss') }
  this.getValue = () => {
    return {
      totalTime: this.totalTime,
      stepTime: this.stepTime,
      remainingTime: this.remainingTime
    }
  }
}

module.exports = class Brew {
  constructor(io, store, temperatures, gpio, updateStore, temperatureArray, GPIO) {
    // construct the variables for the brew session
    this.io = io
    this.store = store
    this.gpio = gpio
    this.GPIO = GPIO
    this.previousStore = this.store.value
    this.activeStep = null
    this.stepClass = null

    // total time
    var recentTemp = _.last(temperatureArray)
    this.totalTime = _.get(recentTemp, 'totalTime', 0)
    this.time = new Time()
    this.time.setTotalTime(this.totalTime)
    this.time.setStepTime(_.get(recentTemp, 'stepTime', 0))
    this.time.setRemainingTime(_.get(recentTemp, 'remainingTime', 0))

    var initCron = true

    var that = this

    // Create a default CronJob that will run every second and update the store any time there is a change in the active step
    this.storeJob = new CronJob({
      cronTime: '*/1 * * * * *',
      onTick: () => {
        if (initCron || (this.store.value && !_.isEqual(this.store.value.recipe.activeStep, {complete: true}) && !_.isEqual(
          this.store.value.recipe && this.store.value.recipe.activeStep && this.store.value.recipe.activeStep.id,
          this.previousStore && this.previousStore.recipe.activeStep && this.previousStore.recipe.activeStep.id
        ))) {
          initCron = false
          this.previousStore = this.store.value

          // the current active step
          this.activeStep = this.store.value.recipe.activeStep

          console.log(this.activeStep)

          // if a current step is running, finish it up and add it to the recipe array
          if (this.stepClass && this.stepClass.isRunning)
            this.stepClass.stop()

          var pidSettings = {
            kp: this.store.value.settings.rims.proportional,
            ki: this.store.value.settings.rims.integral,
            kd: this.store.value.settings.rims.derivative,
            dt: 1000,
            initial: temperatures.value.temp1,
            target: this.activeStep.setpoint + this.store.value.settings.rims.setpointAdjust,
            u_bound: this.store.value.settings.rims.maxOutput,
            l_bound: 0,
            direction: 'reverse',
            mode: 'auto'
          }

          // Call the correct step
          if (this.activeStep) {
            switch(this.activeStep.type) {
              case 'PREPARE_STRIKE_WATER':
              case 'PREPARE_FOR_HTL_HEAT':
              case 'PREPARE_FOR_MASH_RECIRC':
              case 'PREPARE_FOR_BOIL':
              case 'PREPARE_FOR_WORT_CHILL':
                this.stepClass = new NoAction({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  time: this.time,
                  temperatures: temperatures
                })
                break
              case 'HEATING':
                this.stepClass = new Heat({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  temperatures: temperatures,
                  updateStore: updateStore,
                  pid: pidSettings,
                  time: this.time,
                  GPIO: this.GPIO
                })
                break
              case 'CHILLING':
                this.stepClass = new Chill({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  time: this.time,
                  temperatures: temperatures
                })
                break
              case 'RESTING':
                this.stepClass = new Rest({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  temperatures: temperatures,
                  updateStore: updateStore,
                  pid: pidSettings,
                  time: this.time
                })
                break
              case 'ADD_INGREDIENTS':
              case 'ADD_WATER_TO_MASH_TUN':
              case 'SPARGE':
                this.stepClass = new RestAndConfirm({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  temperatures: temperatures,
                  updateStore: updateStore,
                  pid: pidSettings,
                  time: this.time
                })
                break
              case 'BOIL':
                this.stepClass = new Boil({
                  activeStep: this.activeStep,
                  io: this.io,
                  gpio: this.gpio,
                  store: this.store,
                  temperatures: temperatures,
                  updateStore: updateStore,
                  pid: pidSettings,
                  time: this.time
                })
                break
            }
          }

          if (this.stepClass)
            this.stepClass.start()
        } else if (_.isEqual(this.store.value.recipe.activeStep, {complete: true})) {
          // brew is complete so shut everything off
          this.end()
          return // do not continue on
        } else {
          // set the active step every second which will be propagated to the step classes
          this.activeStep = this.store.value && this.store.value.recipe && this.store.value.recipe.activeStep && this.store.value.recipe.activeStep.id
            ? this.store.value.recipe.activeStep
            : this.activeStep
        }

        // If the brew has started and is not complete count the timer up
        if (_.get(this.store, 'value.recipe.startBrew', false)) {
          this.totalTime += 1
        }
        this.time.setTotalTime(this.totalTime)
        this.io.emit('time', this.time.getValue())
      },
      start: false,
      timeZone: 'America/New_York',
      runOnInit: false
    })
  }

  start() {
    this.storeJob.start()
  }

  stop() {
    var that = this

    this.storeJob.stop()
    this.stepClass ? this.stepClass.stop() : null

    // Turn heating components off
    if (this.gpio) {
      this.gpio.heat1.writeSync(0)
      this.gpio.heat2.writeSync(0)
      this.gpio.contactor1.writeSync(0)
      this.gpio.contactor2.writeSync(0)
      setTimeout(() => {
        that.gpio.pump1.writeSync(0)
        that.gpio.pump2.writeSync(0)
        that.gpio = null
      }, 5000)
    }

    this.io = null
    this.store = null
    this.previousStore = null
    this.activeStep = null
    this.stepClass = null

    this.time.resetTime()
    if (this.io)
      this.io.emit('time', this.time.getValue()) // emit the time one last time to update the front end
  }

  end() {
    // TODO Generate some sort of report so recipes can be compared.
    // set the temperatures complete property to true for this recipe
    const recipeId = get(this.store, 'value.recipe.id', '')
    dbFunctions.completeTimeData(recipeId)
    this.stop()
  }
}
