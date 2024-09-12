![Logo](admin/schlueter-fbh.png)
# ioBroker.schlueter-fbh

[![NPM version](https://img.shields.io/npm/v/iobroker.schlueter-fbh.svg)](https://www.npmjs.com/package/iobroker.schlueter-fbh)
[![Downloads](https://img.shields.io/npm/dm/iobroker.schlueter-fbh.svg)](https://www.npmjs.com/package/iobroker.schlueter-fbh)
![Number of Installations](https://iobroker.live/badges/schlueter-fbh-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/schlueter-fbh-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.schlueter-fbh.png?downloads=true)](https://nodei.co/npm/iobroker.schlueter-fbh/)

**Tests:** ![Test and Release](https://github.com/derHaubi/ioBroker.schlueter-fbh/workflows/Test%20and%20Release/badge.svg)

## schlueter-fbh adapter for ioBroker

The Adapter is for controlling/steering a Shlüter underfloor heating. It is developped and tested agains a Schlüter DITR-Heat-E-R6 Thermostat.
The Adapter makes use of the "Schlüter API" and best guesses against that, because it is no documentation about it.
Thanks go to the creators of following sites, who already did the groudn work for the API by checking how the official App is doing things.

https://community.home-assistant.io/t/mwd5-wifi-thermostat-oj-electronics-microtemp/445601


### DISCLAIMER

Please make sure that you consider copyrights and trademarks when you use names or logos of a company and add a disclaimer to your README.
You can check other adapters for examples or ask in the developer community. Using a name or logo of a company without permission may cause legal problems for you.

### Install Adapter

At this Point in Time the Adapter is classified as beta-beta-beta :) I hav it running on my productove Instance but I cannot guarantee that everything will work properly and I accept no liability for any damage or failures.

1. On Adapter-Section in ioBroker get into Expert Mode
1. now the adapter can be installed by giving the follwing GIT-Hub Address as Custom-Url
	https://github.com/derHaubi/ioBroker.schlueter-fbh
1. After Adapter Installation create an Instance and then give following Parameters in the Adapters-Admin-Section
	Username:	Username of the Schlüter Account (If you have the App you have the Account, elso you need one)
	Password: 	Password of Account
	CustomerID: keep it as 3 (nothing else works with Schlüter here)
	Refresch GroupData..:	Give the Time in Minutes the Adapter gets the Group Data (means everything what is in your Account)
	Scheduled Job:	here you give the Minutes of the hour when the "Energy Call" is done. This is done once per hour
	Timeout for After-Post: 	Afetr a Post of a command to a Thermostat it can be that he API needs a bit to get actual values. So if a "Steering Post" is done, then after this time a Group Update is done again. This Update is then in between of the Updates done in the Time given by "Refresh Group Data..."
1. Store and Save Setting


### State/Object Description
The Adapter gets the Information for the Account (Group-Call) and the creates States for the found Thermostats.
As for me I only own one Thermostat and nothing else from Schlüter, this it what I can offer.
The Adapter "should be" already aware of haveing more than one Group and more than one Thermostat. But it is not tested againts that.

State-Definition

| Path | Type | read only | from API | Description |
|-------------|-------------|-------------|-------------|-------------|
| groupContentJSON | state | yes | yes | JSON of the "Group"-API Call which gets all Info for the Account (stringified JSON) |
| lastGroupUpdate | state | yes | yes | Timestamp of the last "Group"-API-Call |
| xxxxx | group | -- | yes | ID and root of a Group-States defined in Schlüter API |
| xxxxx | group | -- | yes | ID and root of a Group-States defined in Schlüter API |
| xxxxx.GroupId | indicator | yes | yes | Group-ID of the group given by/from Schlüter |
| xxxxx.GroupName | indicator | yes | yes | Name of the Group given by User in the Schlüter APP (currently not changeable via Adapter) |
| xxxxx.Thermostats | Folder | yes | yes | Grouping Element to distinguish between Thermostats within a Group. For this table I use yyy insted of xxxxx.Thermostats|
| xxxxx.Thermostars.yyyyyy | device | yes | yes | One specific Thermostat within a group. This is also the Serial-Nr of the Themrostat. For this table I use zzz. insted of xxxxx.Thermostats.yyyyyy |
| zzz.BoostEndTime | state | yes | yes | String: of the Time when a Boost-Mode ends in Format "YYYY-MM-DDTHH:mm:ss |
| zzz.ComfortEndTime | state | no | yes | String: of the Time when a Comfort-Mode ends in Format "YYYY-MM-DDTHH:mm:ss |
| zzz.ComforSetpoint | state | no | yes | Number: telling the Thermostat what is the "Comfort-Temperature during Comfort-Mode Time. Can be set but will after End of Comfort-Mode reset to 23° by Thermostat/API |
| zzz.FloorTemperature | state | no | yes | Number: Temperatuer in Degree given as Integer (menas 23.5 will be delivered and also needs to be set/posted as 2350) |
| zzz.GroupName | indicator | yes | yes | String: Name of the Group in which the Thermostat is living |
| zzz.Heating | indicator | yes | yes | Boolean: Indicator if Heating is in or off (sometimes takes time to be updated in API) |
| zzz.Id | indicator | yes | yes | Number: ID of the Thermostat, not to be confised with SerialNumber |
| zzz.LastPrimaryModeIsAuto | indicator | yes | yes | Boolean: Just created a State for it. At this Pint in Time you cannot change that |
| zzz.ManualModeSetpoint | state | yes | yes | Number: Temperatuer in Degree given as Integer (menas 20 will be delivered and also needs to be set/posted as 2000) |
| zzz.MaxSetpoint | indicator | yes | yes | Number: max. Value to be set as Temeperature (here we have really 40 as 40, not like Comfort/Manual-Setpoints) |
| zzz.MinSetpoint | indicator | yes | yes | Number: min. Value to be set as Temeperature (here we have really 5 as 5, not like Comfort/Manual-Setpoints) |
| zzz.Online | indicator | yes | yes | Boolean: Showing if hte Thermostat is online (Funny thing, cause if not online it could not tell :)) |
| zzz.RegulationMode | indicator | yes | yes | Number: showing the Current Reglation-Mode of the Thermostat. If there is more than one Thermostat in a group it seems that this needs tobe controlled in the Group Path and not in the Thrmostat Path (inspect groupContentJSON). We currently knwo following Modes:<ul><li>1 = Schedule</li><li>2 = Comfort Mode</li><li>3 = Manual Mode</li><li>8 = Boost Mode</li><li>9 = Eco Mode (Adapter is not handlich that at this Point in Time)</li></ul> |
| zzz.RoomTemperature | state | no | yes | Number: Temperatuer in Degree given as Integer (menas 23.5 will be delivered and also needs to be set/posted as 2350) |
| zzz.SerialNumber | indicator | yes | yes | String: Serial-Nr. of the Thermostat, also used as Path Identifier/Foler xxxxx.Thermostats.SERIALNUMBER |
| zzz.ThermostatName | indicator | yes | yes | String: Name of the Thermostat given via the Schlüter-APP (not chagable currently via Adapter) |
| zzz.BoostTimeInMinutes | state | yes | No | Integer: Control-State to give the Duration in Minutes how longn the Bosst Time shoudl be active |
| zzz.ComfortTimeInMinutes | state | yes | No | Integer: Control-State to give the Duration in Minutes how longn the Comfort Time shoudl be active |
| zzz.energyDaily | state | yes | No | String: to be described |
| zzz.energyLastCallQuery | state | yes | No | String: stringified JSON of the latest Energy Call done by the User (see Section "Energy Calls") |
| zzz.energyLastCallResult | state | yes | No | String: stringified JSON of the latest Energy Call Result enriched by the Adapter with DateTime Information (see Section "Energy Calls") |
| zzz.energyLastCallResultRAW | state | yes | No | String: RAW stringified JSON of the latest Energy Call Result (so not enriched with additional Information by Adapter). Thee Data is stored as JSON-Data which can be used in JSON-Table Widgets such as Scroungers-Material Design Widgets|
| zzz.energyToday | state | yes | No | number: kw/h received by the hourly Energy Call for Today - what was the consumtion for today. This is not "Consumption by NOW". It seems that the Thermostat delivers that Value only once per hour to Schlüter |
| zzz.energyYesterday | state | yes | No | number: consumption in kw/h for yesterday. Beause of the delivering only once per hour the giess is to have a valid Amount at 1.30 am or 2am if the Heating runs between 11 and 12pm |
| zzz.setRegulationMode | state | yes | No | String: Controll-State to start Comfort/Boost/Eco Mode. This is done by writing a sringified Array into that state. For Comfort Mode eg.<ul><li>"2,40,25"</li></ul>means: start Comfort-Mode for 40 Minutes with 25° |


## General Info about switching Modes
The Thermostat, the API and therefore also the Adapter is switching Mode as follows:
* to Manual-Mode: you can siwtch to manuel mode under all cirumstances. Threfore ManualModeSetpoint needs to be posted
* to Comfort-Mode: to switch to Comfort-Mode you need to creat a Post againts the API giving
	* RegulationMode: 3
  	* ComfortSetPoint: Temperatur for the Mode
  	* ComfortEndTime: Formatted Endtime for Comfort Mode (Format: "YYYY-MM-DDTHH:mm:ss)

**When reaching Endtime the Thermostat will fall Back to Mode: Scheduled !!!**
* to Boost-Mode: to switch to Boost-Mode you need to creat a Post againts the API giving
	* RegulationMode: 8
	* ComfortEndTime: Formatted Endtime for Boost Mode (Format: "YYYY-MM-DDTHH:mm:ss)

**When reaching Endtime the Thermostat will fall Back to Mode: Scheduled !!!**
* to ECO-Mode: to be done
* to Schedule Mode: to be done

## Energy Calls
The Adapter calls once per hour for the Consumtion of the Thermatstat.
Once per hour because it seems that the Themrostat deliver the Consumption only once per hour to Schlüter.
That means:
* We do not get the current Consumption of the Heating asap
* I do not know when exaclty the Thermostat delivers the Data. For me it is always round abaout 5 Minutes after full hour (so: 15.06, 16.06, 17.06, etc.)
* Therefore we have the Admin-Parameter to tell when this hourly Job should run ("Scheduled Job")

The other Energy Calls whoch could be done will be described in future.


## Visualization (at least some sort of)
The File "testView.html" hold a VIS-View which is making use of the Adapters delivered Data and some steering/controlling things concering changeing the Modes.
You can Import the View, but then within the HTML-Sections you ned to give the correct IDs for your Group/Thermostat.
As the Adapter is Beta, this is also for that View. I use in in my Production but again no guarantee.

**Attention: A Requirement for this vie is that Adapter "Material Design Widgets" (by Scrounger) is installed for VIS.** 
![schlueter_vis_test_view](https://github.com/user-attachments/assets/e8a68b42-8b7b-406d-8705-a8bd91f67d78)

## To be done
* Visualize the Schedule Data of a Thermostat in a proper way and have possibility to change it via VIS
* Visualize the Energy Call Part in Proper Way
* Have a nice looking Widget-Set (maybe Thermostat-Based in the Adapter) - Iam to dump to this
* Long Time Tests
* Testing with more than one Grou and/or more than one Thermostat (not possible for me cause I only own one)


## Changelog
### 0.3.0
* Initial Release

### **WORK IN PROGRESS**
* (derHaubi) initial release

## License
MIT License

Copyright (c) 2024 derHaubi <haubi@css-haupt.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
