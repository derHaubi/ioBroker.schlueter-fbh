"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const schedule = require("node-schedule");
const { start } = require("repl");
const { DateTime } = require("luxon");

class SchlueterFbh extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "schlueter-fbh",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));
		this.apikey = "f219aab4-9ac0-4343-8422-b72203e2fac9";
		this.token = "unknown";
		this.baseURL = "https://owd5-mh015-app.ojelectronics.com/api/";
		this.authPath = "UserProfile/SignIn";
		this.grouConPath = "Group/GroupContents";
		this.energyPath = "EnergyUsage/GetEnergyUsage";
		this.groupUpdatePath = "Group/UpdateGroup"
		this.initialize = true;
		this.serverTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;;
	}

	async getSessionID() {
		let tokenBody = {
			"APIKEY": this.apikey,
			"ClientSWVersion": 1,
			"CustomerId": this.config.customerid,
			"Password": this.config.password,
			"UserName": this.config.username
		};

		const response = await this.postJSONData(this.authPath, {}, tokenBody);
		if (response != null) {
			return response.SessionId;
		} else {
			return "invalid";
		}
	}

	async reLogin() {
		this.token = await this.getSessionID();
		if (this.token == "invalid" || this.token == "") {
			this.log.error("Error getting Session-ID, maybe not reachable, API-Key changed or wrong credentials.");
			return false;
		} else {
			return true;
		}
	}

	getQueryParamString(queryParams = {}) {
		const qpKeys = Object.keys(queryParams);
		if (qpKeys.length > 0) {
			//qpKeys.map(k => k + "=" + encodeURIComponent(queryParams[k]));  //kurze Alternative!!!
			const kv = qpKeys.map(function (k) {
				return k + "=" + encodeURIComponent(queryParams[k]);
			});
			return "?" + kv.join("&");
		}
		return "";
	}

	/*
		Helperfunction for Posts with JSON Data, Paramaters or empty
		Result is JSON-Response either Data as JSON or NULL
	*/
	async postJSONData(path, queryParams = {}, data = {}) {
		const url = this.baseURL + path + this.getQueryParamString(queryParams);
		this.log.debug("URL to post: " + url);
		this.log.debug("Oject to post: " + JSON.stringify(data, null, 2));

		// Default options are marked with *
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data), //here only JSON allowed
		});
		if (response.ok) {
			return response.json(); // parses JSON response into native JavaScript objects
		} else {
			return null;
		}
	}

	async getJSONData(path, queryParams = {}, cnt) {

		if (!cnt) cnt = 0;
		cnt++;
		if (cnt == 5) return null;

		const url = this.baseURL + path + this.getQueryParamString(queryParams);
		this.log.debug("API-Call to: " + url);
		const response = await fetch(url);
		if (response.ok) {
			return response.json();
		} else {
			this.log.debug("trying to get Token");
			if (!await this.reLogin()) return null;
			queryParams.sessionid = this.token; //if relogin successful then write new SessionID (token) into queryParams
			return this.getJSONData(path, queryParams, cnt); //nach relogin sich selbsterneut aufrufen
		}

	}

	/*
		Holt die GroupData und schreibt bei Erfolg LastGroupUpdate
	*/
	async updateGroupData() {
		const groupDataResponse = await this.getJSONData(this.grouConPath, { sessionid: this.token, APIKEY: this.apikey });
		if (groupDataResponse != null) {
			this.setStateAsync("lastGroupUpdate", { val: String(new Date()), ack: true });
			this.setStateAsync("groupContentJSON", { val: JSON.stringify(groupDataResponse), ack: true });
		}
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		const me = this;
		// Initialize your adapter here

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.debug("config username: " + this.config.username);
		this.log.debug("config Customer-ID: " + this.config.customerid);
		this.log.debug("config TimerGroup Call (m): " + this.config.timerGroup);
		this.log.debug("Config Server TimeZone: " + this.serverTimeZone);



		await this.setObjectNotExistsAsync("groupContentJSON", {
			type: "state",
			common: {
				name: "groupContentJSON",
				type: "string",
				role: "state",
				read: true,
				write: true,
			},
			native: {},
		});
		this.subscribeStates("groupContentJSON");

		await this.setObjectNotExistsAsync("lastGroupUpdate", {
			type: "state",
			common: {
				name: "lastGroupUpdate",
				type: "string",
				role: "state",
				read: true,
				write: true,
			},
			native: {},
		});
		//this.subscribeStates("lastGroupUpdate");

		//Get Data on Adapter Start and start a Timer for given Interval in Minutes
		const t = +this.config.timerGroup || 5; //Save your ass, if nothing is in Admin-Panel then set to 5 Minutes
		this.updateGroupData();
		this.timerGroup = this.setInterval(function () {
			me.updateGroupData();
		}, t * 60 * 1000);

		//Schedule Job for getting Energy Information once per Hour at given Minutes from Config
		let cronMin = this.config.energyCronMinutes;
		if (cronMin == "-1") {
			cronMin = "*";
		} else if (cronMin == "undefined") {
			cronMin = "15";
		}
		const cronExpr = cronMin + " * * * *";
		this.log.debug("Cron-Expression for Energy-Poll: " + cronExpr);
		this.schedEnergy = schedule.scheduleJob(cronExpr, function () {
			me.log.info("Schedule Job - Poll Energy Data started");
			me.getThermostatEnergy();
		});
	}

	async getThermostatEnergy() {
		const content = await this.getStateAsync(this.namespace + ".groupContentJSON");
		const obj = JSON.parse(content.val).GroupContents;

		//generate Date for the Query - to get current day we need to query next day. 
		//Time is not relevant and set to 12.00am
		const queryDate = DateTime.now().setZone(this.serverTimeZone).plus({ days: 1 }).toFormat("yyyy-MM-dd'T12:00:00'");

		for (let i = 0; i < obj.length; i++) {
			for (let y = 0; y < obj[i].Thermostats.length; y++) {
				const varQueryParam = {
					"DateTime": queryDate,
					"History": 1,
					"ViewType": 1
				}

				this.postEnergyCall(obj[i].GroupId, obj[i].Thermostats[y].SerialNumber, varQueryParam, true);
			}
		}

	}



	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		this.log.debug("Adapter unload started");
		try {
			// Clear all ScheduledJobs, Timers and Intevarls
			schedule.clearSchedule(this.schedEnergy);
			clearInterval(this.timerGroup);
			clearTimeout(this.UpdateTimeout);
			this.log.debug("Adapter unloaded");

			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// cchek if State was changed by adapter itself
			const changedByAdapter = state.from.includes(this.namespace);

			if (id == this.namespace + ".groupContentJSON") {
				//Always create/check/set States after an API Call getting the Group Information (groupContentJSON)
				this.log.debug("State GroupContentJSON changed.");
				this.createUpdateGroupStates(JSON.parse(state.val));
			}

			if (!changedByAdapter) { //if not changed by adapter itself (assumption by user)
				this.log.debug(`State Change by User \nState:      ${id} \nchanged to: ${state.val} \nfrom:       ${state.from} \nuser:       ${state.user} \nack:        ${state.ack}`);

				if (id.includes(".Thermostats.")) {
					//Works if States are created by Adapter Patter eg. schlueter-fbh.0.GROUP-ID.Thermostats.THERM-ID.RegulationMode
					const myID = id.replace(this.namespace + ".", "");
					const arrIDName = myID.split(".");
					const curGroup = arrIDName[0];
					const curThermID = arrIDName[2];
					const curStateID = arrIDName[3];

					switch (curStateID) {
						case "setRegulationMode":
							const arrRM = state.val.split(",");
							if (arrRM[0] == "2") { //Comfort
								this.setStateAsync(curGroup + ".Thermostats." + curThermID + ".ComfortTimeInMinutes", { val: +arrRM[1], ack: true });
								this.postToThermostat(curGroup, curThermID, "csp", arrRM);
							} else if (arrRM[0] == "8") { //Boost
								this.setStateAsync(curGroup + ".Thermostats." + curThermID + ".BoostTimeInMinutes", { val: +arrRM[1], ack: true });
								this.postToThermostat(curGroup, curThermID, "boost", arrRM);
							} else if (arrRM[0] == "9") { //Eco
								// to be done
							} else if (arrRM[0] == "1") { //Schedule
								// to be done
							};

							this.setStateAsync(id, { val: -1, ack: true }); //set controllState back to -1
							break;
						case "ManualModeSetpoint":
							this.postToThermostat(curGroup, curThermID, "mms");
							break;
						case "energyLastCallQuery": //just for testing purposes
							this.postEnergyCall(curGroup, curThermID, JSON.parse(state.val));
							break;
						default:
							this.log.debug(`Unkonwn state ${id}  + ${state.val} + changed.`);
					}
				}
			}
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 * Function is handling the Calls for Energy-Counter/Measurement of a Thermostat
	 * Writing results into States
	 * 
	 * @param {string} groupID ID of the Group the Thermostat belongs to
	 * @param {string} thermoID ID of the Thermostat
	 * @param {Object} varQueryParam variable Set of Query-Parameters looks like
	 * 					{
	 * 						"DateTime": "2024-09-06T13:05:00",
	 * 						"History": 1,
	 * 						"ViewType": 2,
	 *					}
	 * @param {boolean} scheduledJob is Function called from Scheduled Job?
	 */
	async postEnergyCall(groupID, thermoID, varQueryParam, scheduledJob = false) {
		let stateIdPath = groupID + ".Thermostats." + thermoID;
		let queryType = "undefined";

		const staticQueryParam = {
			"APIKEY": this.apikey,
			"ThermostatID": thermoID
		}

		varQueryParam.origGivenDate = varQueryParam.DateTime;
		let queryDateTime = DateTime.fromISO(varQueryParam.DateTime).setZone(this.serverTimeZone);
		if (varQueryParam.ViewType == 1 && varQueryParam.History == 7) { //weekly in hours --really needed?!?
			queryType = "weeklyInHours";
			varQueryParam.DateTime = queryDateTime.startOf("week").plus({ weeks: 1 }).toFormat("yyyy-MM-dd'T'12:00:00") //set to start of next week (Monday)
		} else if (varQueryParam.ViewType == 1) { //Hours
			queryType = "dailyInHours";
		} else if (varQueryParam.ViewType == 2) { //Days
			queryType = "WeekInDays";
			varQueryParam.DateTime = queryDateTime.startOf("week").plus({ weeks: 1 }).toFormat("yyyy-MM-dd'T'12:00:00") //set to start of next week (Monday)
		} else if (varQueryParam.ViewType == 4) { //Months
			queryType = "Month";
			varQueryParam.DateTime = queryDateTime.startOf("year").toFormat("yyyy-MM-dd'T'12:00:00") //first Day of Year
		};


		const engQuery = Object.assign({}, staticQueryParam, varQueryParam);
		this.log.debug(JSON.stringify(engQuery, null, 2));

		let res = await this.postJSONData(this.energyPath, { sessionId: this.token }, engQuery);

		if (scheduledJob) {
			//the hourly Job is used two Write Daily Total and Total of Yesterday only
			this.writeScheduleJobEnergyResult(res, stateIdPath);
		} else {
			this.setStateAsync(stateIdPath + ".energyLastCallResultRAW", { val: JSON.stringify(res, null, 2), ack: true });
			res = this.enrichEnergyCallResult(queryType, res, engQuery.DateTime); //create JSON-Data to display in JSON-Table-Widget
			this.setStateAsync(stateIdPath + ".energyLastCallResult", { val: JSON.stringify(res, null, 2), ack: true });
		}
	}

	writeScheduleJobEnergyResult(data, stateIdPath) {
		try {
			const values = this.calculateSumForUsage(data);
			this.setStateAsync(stateIdPath + ".energyToday", { val: values[0], ack: true });

			//between 0.00am and 2.01am we write Data for Yesterday again
			//this is because it can take up to an hour until Data is updated at Schlüter
			//so if have consumption between 23 and 24 we probably will not get that if we do not do it like this
			const startTime = { hours: 0, minutes: 0 };
			const endTime = { hours: 2, minutes: 1 };
			if (this.isInTimeFrame(startTime, endTime)) {
				this.setStateAsync(stateIdPath + ".energyYesterday", { val: values[1], ack: true });
			}

		} catch {
			this.log.error("No valid Result for Scheduled Energy Query recived");
		}

		//this.setStateAsync(groupID + ".Thermostats." + thermoID + ".energyLastCallResultRAW", { val: JSON.stringify(res, null, 2), ack: true });
	}

	isInTimeFrame(startTime, endTime) {
		const now = DateTime.now().setZone(this.serverTimeZone);

		// Convert start and end times to DateTime objects for today in the given timezone
		const startDateTime = now.startOf('day').plus({ hours: startTime.hours, minutes: startTime.minutes });
		const endDateTime = now.startOf('day').plus({ hours: endTime.hours, minutes: endTime.minutes });

		// Check if the current time is within the specified range
		return now >= startDateTime && now <= endDateTime;
	}

	calculateSumForUsage(data) {
		return data.EnergyUsage.map(usageBlock => {
			const total = usageBlock.Usage.reduce((sum, entry) => sum + entry.EnergyKWattHour, 0);
			return total;
		});
	}

	/**
	 * 
	 * @param {string} type Type of Energy Query and delivered Result (see in Function postEnergyCall) 
	 * @param {Object || JSON} energy  JSON-Object of the given Result of the Query 
	 * @returns 
	 */
	enrichEnergyCallResult(type, energy, strDateTime) {
		this.log.debug(type + " - " + strDateTime);
		let res = [];

		let date = DateTime.fromISO(strDateTime).setZone(this.serverTimeZone);

		let startHour = 23
		let endHour = 24
		let startMonth = 12
		let startYear = date.year;

		function decrementHourly() {
			if (startHour > 0) {
				startHour--;
				endHour--;
			} else {
				startHour = 23;
				endHour = 24;
				date = date.minus({ days: 1 });
			}
		}

		function decrementMonth() {
			if (startMonth > 1) {
				startMonth--;
			} else {
				startMonth = 12
				startYear--;
			}
		}

		if (type == "dailyInHours" || type == "WeekInDays" || type == "weeklyInDays") {
			date = date.minus({ days: 1 }); //we always look from one day in past
		}

		energy.EnergyUsage.forEach(usageBlock => {
			usageBlock.Usage.forEach(usageEntry => {
				if (type == "dailyInHours") {
					let obj = {};
					obj.date = date.toFormat("yyyy-MM-dd");
					obj.time = String(startHour).padStart(2, "0") + "-" + String(endHour).padStart(2, "0");
					obj.kwh = usageEntry.EnergyKWattHour;
					res.push(obj)
					decrementHourly();
				} else if (type == "WeekInDays" || type == "weeklyInDays") {
					let obj = {};
					obj.date = date.toFormat("yyyy-MM-dd");
					obj.time = "00-24";
					obj.kwh = usageEntry.EnergyKWattHour;
					res.push(obj)
					date = date.minus({ days: 1 });
				} else if (type == "Month") {
					let obj = {};
					obj.date = startYear;
					obj.time = startMonth;
					obj.kwh = usageEntry.EnergyKWattHour;
					res.push(obj)
					decrementMonth();
				}

			})
		})

		return res;
	}



	async postToThermostat(groupID, thermoID, postType, arrRM = []) {
		const me = this;
		const stateID = this.namespace + "." + groupID + ".Thermostats." + thermoID + ".";
		const curManualModeSetpoint = await this.getStateAsync(stateID + "ManualModeSetpoint");
		const curComfortSetpoint = await this.getStateAsync(stateID + "ComfortSetpoint");
		const ComfortMinutes = await this.getStateAsync(stateID + "ComfortTimeInMinutes");
		const BoostMinutes = await this.getStateAsync(stateID + "BoostTimeInMinutes");

		let postJSON = {};

		postJSON.APIKEY = this.apikey;
		postJSON.SetGroup = {};
		postJSON.SetGroup.GroupId = groupID;

		if (postType == "mms") { //ManualMode was set by user
			postJSON.SetGroup.ManualModeSetpoint = curManualModeSetpoint.val * 100;
			postJSON.SetGroup.RegulationMode = 3;
		} else if (postType == "csp") {
			this.log.debug("RegulationModeArray mode,minutes,temp: " + arrRM.toString() + ' Test: ' + +arrRM[1]);
			postJSON.SetGroup.ComfortSetpoint = arrRM[2] * 100; //curComfortSetpoint.val * 100;
			postJSON.SetGroup.ComfortEndTime = this.createEndDateString("minutes", +arrRM[1] || 30); //this.createEndDateString("minutes", ComfortMinutes.val || 30);
			postJSON.SetGroup.RegulationMode = 2;
		} else if (postType == "boost") {
			postJSON.SetGroup.BoostEndTime = this.createEndDateString("minutes", +arrRM[1] || 30); //this.createEndDateString("minutes", BoostMinutes.val || 30);
			postJSON.SetGroup.RegulationMode = 8;
		}

		const res = await this.postJSONData(this.groupUpdatePath, { sessionId: this.token }, postJSON);
		this.log.debug("POST: " + JSON.stringify(res));
		this.updateGroupData();
		this.UpdateTimeout = this.setTimeout(function () {
			me.updateGroupData();
		}, me.config.afterPostRecallTimout * 1000);

	}

	/**
	 * Creates an EndTime-String (eg. "2024-09-06T13:56:15") from current DateTime 
	 * up to x Minutes/Hours in the Future
	 * 
	 * @param {string} type switch to decide what to do or for what Function EndTime needs to be calculated (to be done)
	 * @param {number} time (minutes, hours) given Number of minutes or hours
	 * @returns {string}	teh calculated Date as String in Server TimeZone in following Fromat "YYYY-MM-DDTHH:mm:ss"
	 */
	createEndDateString(type, time) {
		let endDateTime = DateTime.now().setZone(this.serverTimeZone);
		if (type == "minutes") {
			endDateTime = endDateTime.plus({ minutes: time });
		} else if (type == "hours") {
			endDateTime = endDateTime.plus({ hours: time });
		}

		return endDateTime.toFormat("yyyy-MM-dd'T'HH:mm:ss");
	}



	/*
	fromUnixTime(unixTime) {
		const date = new Date(unixTime);
	
		// Erhalte das Datum in einem lesbaren Format
		const formattedDate = date.toISOString().slice(0, 19).replace('T', ' ');
		return formattedDate;
	}
	*/

	async createUpdateGroupStates(groupData) {
		//this.log.info(Object.keys(obj));
		const arrGroups = groupData.GroupContents;

		//this.log.info(JSON.stringify(arrGroups, null, 2));
		for (let gK = 0; gK < arrGroups.length; gK++) {
			await this.createUpdateGroups(arrGroups[gK]);
		}

		this.initialize = false; //set boolean to false after first call of State-Creation
	}

	async createUpdateGroups(obj) {
		const GroupStates = [
			"GroupId",
			"GroupName"
		];

		/*
		const ThermostatStates = [
			"Id",
			"SerialNumber",
			"ThermostatName",
			"GroupName",
			"Online",
			"Heating",
			"RoomTemeprature",
			"FloorTemeperature",
			"RegulationMode",
			"ComfortSetpoint",
		];
		*/

		await this.createState(obj.GroupId.toString(), "", "group", "group", "indicator", true, false);

		for (let i = 0; i < GroupStates.length; i++) {
			await this.createState(obj.GroupId + "." + GroupStates[i], GroupStates[i], "state", "string", "indicator", true, false);
		}

		const thermo = obj.Thermostats;
		for (let j = 0; j < thermo.length; j++) {
			const idPrefix = obj.GroupId + "." + "Thermostats." + thermo[j].SerialNumber;
			const curTherm = obj.Thermostats[j];
			let usedStates = [];

			//Create States if needed/not existing
			await this.createState(idPrefix, curTherm.ThermostatName, "device", "device", "indicator", true, false, false);
			await this.createState(idPrefix + "." + "Id", "ID", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "Id");
			await this.createState(idPrefix + "." + "SerialNumber", "SerialNumber", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "SerialNumber");
			await this.createState(idPrefix + "." + "ThermostatName", "ThermostatName", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "ThermostatName");
			await this.createState(idPrefix + "." + "GroupName", "GroupName", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "GroupName");
			await this.createState(idPrefix + "." + "Online", "Online", "state", "boolean", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "Online");
			await this.createState(idPrefix + "." + "Heating", "Heating", "state", "boolean", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "Heating");
			await this.createState(idPrefix + "." + "RoomTemperature", "RoomTemperature", "state", "number", "number", true, false, false);
			usedStates.push(idPrefix + "." + "RoomTemperature");
			await this.createState(idPrefix + "." + "FloorTemperature", "FloorTemperature", "state", "number", "number", true, false, false);
			usedStates.push(idPrefix + "." + "FloorTemperature");
			await this.createState(idPrefix + "." + "RegulationMode", "RegulationMode", "state", "number", "number", true, false, false);
			usedStates.push(idPrefix + "." + "RegulationMode");
			await this.createState(idPrefix + "." + "ComfortSetpoint", "ComforSetPoint", "state", "number", "number", true, false, false);
			usedStates.push(idPrefix + "." + "ComfortSetpoint");
			await this.createState(idPrefix + "." + "ComfortEndTime", "ComfortEndTime", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "ComfortEndTime");
			await this.createState(idPrefix + "." + "BoostEndTime", "BoostEndTime", "state", "string", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "BoostEndTime");
			await this.createState(idPrefix + "." + "ManualModeSetpoint", "ManualModeSetpoint", "state", "number", "number", true, true, true);
			usedStates.push(idPrefix + "." + "ManualModeSetpoint");
			await this.createState(idPrefix + "." + "LastPrimaryModeIsAuto", "LastPrimaryModeIsAuto", "state", "boolean", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "LastPrimaryModeIsAuto");
			await this.createState(idPrefix + "." + "MinSetpoint", "MinSetpoint", "state", "number", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "MinSetpoint");
			await this.createState(idPrefix + "." + "MaxSetpoint", "MaxSetpoint", "state", "number", "indicator", true, false, false);
			usedStates.push(idPrefix + "." + "MaxSetpoint");

			//additional Control-States
			await this.createState(idPrefix + "." + "setRegulationMode", "setRegulationMode", "state", "string", "string", true, true, true, -1);
			await this.createState(idPrefix + "." + "BoostTimeInMinutes", "BoostTimeInMinutes", "state", "number", "number", true, true, false, 60);
			await this.createState(idPrefix + "." + "ComfortTimeInMinutes", "ComfortTimeInMinutes", "state", "number", "number", true, true, false, 60);
			await this.createState(idPrefix + "." + "startBoost", "startBoost", "state", "boolean", "boolean", true, true, true, false);

			//additonal State for Energy Measurement
			await this.createState(idPrefix + "." + "energyDaily", "energyDaily", "state", "string", "string", true, false, false);
			await this.createState(idPrefix + "." + "energyLastCallResult", "energyLastCallResult", "state", "string", "string", true, false, false);
			await this.createState(idPrefix + "." + "energyLastCallResultRAW", "energyLastCallResultRaw", "state", "string", "string", true, false, false);
			await this.createState(idPrefix + "." + "energyLastCallQuery", "energyLastCallQuery", "state", "string", "string", true, true, true);
			await this.createState(idPrefix + "." + "energyToday", "energyToday", "state", "number", "number", true, false, false);
			await this.createState(idPrefix + "." + "energyYesterday", "energyYesterday", "state", "number", "number", true, false, false);


			//Set GroupStates
			for (let y = 0; y < usedStates.length; y++) {
				this.setStateAsync(obj.GroupId + "." + GroupStates[y], { val: curTherm[GroupStates[y]], ack: true });
			}

			//Set Thermostat-Specific States
			for (let z = 0; z < usedStates.length; z++) {
				//Temeprature Values are given *100 (eg. 12.5° is given as 1250)
				const tempValues = ["RoomTemperature", "FloorTemperature", "ComfortSetpoint", "ManualModeSetpoint", "MinSetpoint", "MaxSetpoint"];
				let v = curTherm[usedStates[z].split(/[. ]+/).pop()];
				if (tempValues.some(keyword => usedStates[z].includes(keyword))) {
					v = v / 100;
				}
				this.setStateAsync(usedStates[z], { val: v, ack: true });
			}

		}
		//this.log.info(obj.GroupName);
	}

	/**
	 *
	 * @param {string} id 			ID of the State (complete Path)
	 * @param {string} name			Name of State/Group/Device
	 * @param {string} stateType 	Type can be group, device, state
	 * @param {string} type			Value-Type number, boolean, string, ...
	 * @param {string} role 		Role equal to type or indicatior (read only then)
	 * @param {boolean} read		is this state readable
	 * @param {boolean} write 		is this state writable
	 * @param {boolean} subscribe	will this state be subscribed by adapter
	 */
	async createState(id, name, stateType, type, role, read, write, subscribe, defValue) {
		let res = {}; //to check if the Stae was created - Object is undefined if state already exists
		if (!defValue) defValue = null;
		res = await this.setObjectNotExistsAsync(id, {
			type: stateType,
			common: {
				name: name,
				type: type,
				role: role,
				def: defValue,
				read: read,
				write: write,
			},
			native: {},
		});

		//if we start the adapter or a state is newly created then we subscribe if needed
		if (this.initialize || typeof (res) != "undefined") {
			if (subscribe) {
				this.log.debug("Subcribed State: " + this.namespace + "." + id);
				this.subscribeStates(id);
			}
		}

	}





	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new SchlueterFbh(options);
} else {
	// otherwise start the instance directly
	new SchlueterFbh();
}
