/*
	ioBroker.vis schlueter-fbh Widget-Set

	version: "0.0.1"

	Copyright 2024 derHaubi h3@css-haupt.de
*/
'use strict';

/* global $, vis, systemDictionary */

// add translations for edit mode
$.extend(true, systemDictionary, {
	// Add your translations here, e.g.:
	// "size": {
	// 	"en": "Size",
	// 	"de": "Größe",
	// 	"ru": "Размер",
	// 	"pt": "Tamanho",
	// 	"nl": "Grootte",
	// 	"fr": "Taille",
	// 	"it": "Dimensione",
	// 	"es": "Talla",
	// 	"pl": "Rozmiar",
	//  "uk": "Розмір"
	// 	"zh-cn": "尺寸"
	// }
});

// this code can be placed directly in schlueter-fbh.html
vis.binds['schlueter-fbh'] = {
	version: '0.0.1',
	showVersion: function () {
		if (vis.binds['schlueter-fbh'].version) {
			console.log('Version schlueter-fbh: ' + vis.binds['schlueter-fbh'].version);
			vis.binds['schlueter-fbh'].version = null;
		}
	},
	createWidget: function (widgetID, view, data, style) {
		var $div = $('#' + widgetID);
		// if nothing found => wait
		if (!$div.length) {
			return setTimeout(function () {
				vis.binds['schlueter-fbh'].createWidget(widgetID, view, data, style);
			}, 100);
		}

		let text = '';
		text = '<div id="' + widgetID + '">';
		text += 'Thremostat: ' + data.oidThermo + '<br>';
		text += 'TH value: <span class="schlueter-fbh-value">' + vis.states[data.oidThermo + '.val'] + '</span><br>';
		text += 'Heating: <span class="schlueter-fbh-value">' + vis.states[data.oidHeating + '.val'] + '</span><br>';
		text += 'Manual Setpoint: <span class="schlueter-fbh-value">' + vis.states[data.oidManSet + '.val'] + '</span><br>';
		text += 'Browser instance: ' + vis.instance + '<br>';
		text += '</div>';


		$('#' + widgetID).html(text);

		// subscribe on updates of value
		function onChange(e, newVal, oldVal) {
			$div.find('.template-value').html(newVal);
		}
		if (data.oid) {
			vis.states.bind(data.oidThermo + '.val', onChange);
			vis.states.bind(data.oidHeating + '.val', onChange);
			//remember bound state that vis can release if didnt needed
			$div.data('bound', [data.oid + '.val']);
			//remember onchange handler to release bound states
			$div.data('bindHandler', onChange);
		}
	},
};

vis.binds['schlueter-fbh'].showVersion();
