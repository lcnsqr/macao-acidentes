/*
 * Objeto para integrar o mapa do Leaflet 
 * (OpenStreetMap) e o mapa de calor (Macao)
 */
var MapView = function(map){
	// Mapa leaflet
	this.map = map;
	this.coords = [];
	this.canvas = {};
	this.radius = 0;
	this.opacity = 0;
	this.dateFrom = "";
	this.dateTo = "";
	this.unidadesOperacionais = [];
	this.mostrarUnidades = [];
	this.local = {};
}
MapView.prototype = {
	marcar: function(){
		// Atualizar exibição de marcadores de unidades operacionais
		this.mostrarUnidades = [];
		var mapview = this;
		$("select[data-tipo=unidade]").each(function(){
			if ( $(this).val() == "1" ) mapview.mostrarUnidades.push($(this).data("codigo"));
		});
		for ( var u = 0; u < this.unidadesOperacionais.length; u++ ){
			this.map.removeLayer(this.unidadesOperacionais[u][1]);
			for ( var m = 0; m < this.mostrarUnidades.length; m++ ){
				if ( this.unidadesOperacionais[u][0] == this.mostrarUnidades[m] ){
					this.unidadesOperacionais[u][1].addTo(this.map);
					break;
				}
			}
		}
	},
	preserve: function(){
		// Save settings
		console.log("Salvando configurações...");
		var settings = {
			zoom: this.map.getZoom(),
			position: [this.map.getCenter().lat, this.map.getCenter().lng],
			radius: this.radius,
			opacity: this.opacity,
			dateFrom: this.dateFrom,
			dateTo: this.dateTo,
			mostrarUnidades: this.mostrarUnidades
		};
		localStorage.setItem("settings", JSON.stringify(settings));
	},
	redraw: function(){
		// Redesenhar o mapa de calor após alterações 
		// de tamanho ou posição no mapa ou no raio 
		// das ocorrências
		$.mobile.loading("show");
		$("#footer-info").html("Gerando mapa de calor...");
		console.log("Gerando mapa de calor...");
		// Convert locals to pixel positions
		var markers = [];

		for(m = 0; m < mapview.coords.length; m++){
			var marker = mapview.map.latLngToContainerPoint(new L.LatLng(mapview.coords[m][0], mapview.coords[m][1]));
			markers.push([marker.x, marker.y]);
		}

		var mapacalor = new Macao(mapview.map.getSize().x, mapview.map.getSize().y, markers);
		mapacalor.radius = mapview.radius;
		mapacalor.plot(function(image){
			// Remove previous heatmap layer
			if ( mapview.map.hasLayer(mapview.canvas) ) {
				console.log("Descartando mapa de calor prévio...");
				mapview.map.removeLayer(mapview.canvas);
			}
			// Add heatmap layer
			mapview.canvas = new L.imageOverlay(image, mapview.map.getBounds(), {opacity: mapview.opacity});
			mapview.canvas.addTo(mapview.map);
			$.mobile.loading("hide");
			$("#footer-info").html(mapview.coords.length + " acidentes de " + mapview.dateFrom + " a " + mapview.dateTo);
		});
	},
	reload: function(){
		// Load ocurrences from DB and show on heatmap
		console.log("Carregando ocorrências do banco de dados...");
		$.mobile.loading("show");
		// Requested interval in months
		var requestedMonths = [];
		var from = new Date(this.dateFrom);
		var to = new Date(this.dateTo);
		var fromMonth = from.getUTCMonth();
		var toMonth = to.getUTCMonth();
		var fromYear = from.getUTCFullYear();
		var toYear = to.getUTCFullYear();
		var m = fromMonth;
		for ( var y = fromYear; y <= toYear; y++ ){
			while ( m < 12 ){
				requestedMonths.push(Date.UTC(y, m) / 1000);
				if ( y == toYear && m == toMonth ) break;
				m++;
			}
			m = 0;
		}
		// Check data in local database
		var cachedMonths = (localStorage.getItem("cachedMonths")) ? localStorage.getItem("cachedMonths").split(',') : [];
		if ( cachedMonths.length == 1 && cachedMonths[0] == '' ){
			cachedMonths = [];
		}
		var missingMonths = [];
		if ( cachedMonths.length == 0 ){
			// No cached months
			missingMonths = requestedMonths;
		}
		else {
			for ( var r = 0; r < requestedMonths.length; r++ ){
				for ( var c = 0; c < cachedMonths.length; c++ ){
					if ( requestedMonths[r] == cachedMonths[c] ) break;
				}
				// If went through entire cachedMonths, the requestedMonth is missing
				if ( c == cachedMonths.length ) missingMonths.push(requestedMonths[r]);
			}
		}
		if ( missingMonths.length > 0 ){
			// Ask server for the missing months
			$("#footer-info").html("Copiando do banco de dados remoto...");
			console.log("Atualizando a partir do servidor...");
			mapview = this;
			/*
			 * Solicitar ao servidor todos os meses envolvidos no 
			 * período que estejam ausentes do banco de dados local.
			 * Resposta será um vetor contendo todas as ocorrências no
			 * período, no formato [{data: ..., latitude: ..., longitude: ...}, ...]
			 */
			$.get("/ocorrencias", {missing: missingMonths.toString()}, function(data){ 
				if (data.result.length > 0){
					// Insert new data
					mapview.insert(data.result, function(){
						// Remember cached months
						for ( var m = 0; m < missingMonths.length; m++ ){
							cachedMonths.push(missingMonths[m]);
						}
						localStorage.setItem("cachedMonths", cachedMonths.toString());
						mapview.read(from, to);
					});
				}
				else {
					// Local data is enough
					mapview.read(from, to);
				}
			}, 'json');
		}
		else {
			// No missing months, load everything from local database
			this.read(from, to);
		}
	},
	insert: function(rows, callback){
		// Store values in the newly created objectStore.
		$("#footer-info").html("Atualizando banco de dados local: <span id=\"footer-progress\">0</span>%");
		console.log("Inserindo novos dados...");
		// Add data
		var transaction = db.transaction(["ocorrencias"], "readwrite");
		var objectStore = transaction.objectStore("ocorrencias");
		var loop = function(row){
			var progress = parseInt(100 * ( row / rows.length ));
			$("#footer-progress").html(progress);
			var value = {data: parseInt(rows[row][0]), latitude: rows[row][1], longitude: rows[row][2]};
			objectStore.add(value).onsuccess = function(){
				row++;
				if ( row < rows.length ){
					loop(row);
				}
				else {
					console.log("Banco de dados atualizado");
					callback();
				}
			}
		}
		// Start recursion
		loop(0);
	},
	read: function(from, to){
		$("#footer-info").html("Selecionando ocorrências entre " + this.dateFrom + " e " + this.dateTo + "...");
		this.coords = [];
		var transaction = db.transaction(["ocorrencias"]);
		var objectStore = transaction.objectStore("ocorrencias");
		var index = objectStore.index("data");
		var boundKeyRange = IDBKeyRange.bound(from.getTime()/1000, to.getTime()/1000, true, true);
		var mapview = this;
		index.openCursor(boundKeyRange).onsuccess = function(event) {
			var cursor = event.target.result;
			if (cursor) {
				mapview.coords.push([cursor.value.latitude, cursor.value.longitude]);
				cursor.continue();
			}
			else {
				// Query end
				if ( mapview.coords.length == 0 ){
					// Might be chrome bug, try again
					mapview.read(from, to);
				}
				else {
					mapview.redraw();
				}
			}
		}
	}
}

var initStart = function() {
	console.log("Iniciando o mapa...");
	// Map size based on screen
	$("div#map").css("padding", 0);
	$("div#map").html("");
	var mapHeight = $(window).height() - ($("div[data-role='header']").first().height()+$("div[data-role='footer']").first().height()+2);
	$("div#map").height(mapHeight);
	$("div#preferences-content").height($(window).height() - 30);
	$("div#preferences").trigger("updatelayout");
	
	// Initialize the map on the "map" div
	var map = new L.Map('map', {minZoom: 4, maxZoom: 13});	
	
	// add an OpenStreetMap tile layer
	L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
		attribution: '<a href="http://www.openstreetmap.org/copyright" title="&copy; OpenStreetMap contributors">OpenStreetMap</a>'
	}).addTo(map);

	// Start heatmap
	console.log("Carregando configurações...");
	if ( ! localStorage.getItem("settings") ){
		// Default settings
		var settings = {
			zoom: 4,
			position: [-15.798889, -47.866667],
			radius: 20,
			opacity: .6,
			dateFrom: "2013-06-01",
			dateTo: "2013-06-30",
			mostrarUnidades: []
		};
		localStorage.setItem("settings", JSON.stringify(settings));
	}
	// Load settings
	var settings = JSON.parse(localStorage.getItem("settings"));
	var center = new L.LatLng(settings.position[0], settings.position[1]);
	map.setView(center, settings.zoom);
	// Map and Heatmap viewer
	mapview = new MapView(map);
	mapview.radius = settings.radius;
	mapview.opacity = settings.opacity;
	mapview.dateFrom = settings.dateFrom;
	mapview.dateTo = settings.dateTo;
	mapview.mostrarUnidades = settings.mostrarUnidades;
	$("#radius").val(parseInt((mapview.radius - 102) / -10));
	$("#radius").slider("refresh");
	$("#opacity").val(parseInt(mapview.opacity * 10));
	$("#opacity").slider("refresh");
	$("#date-from").val(mapview.dateFrom);
	$("#date-to").val(mapview.dateTo);
	$("input[type=date]").mask("9999-99-99",{placeholder:"_"});
	$("select[data-tipo=unidade]").val("0");
	$("select[data-tipo=unidade]").slider("refresh");
	for ( var u = 0; u < mapview.mostrarUnidades.length; u++ ){
		$("select[data-codigo="+mapview.mostrarUnidades[u]+"]").val("1");
		$("select[data-codigo="+mapview.mostrarUnidades[u]+"]").slider("refresh");
	}

	// Load ocurrences from DB and draw map
	mapview.reload();

	var criarUnidades = function(){
		// Criar marcadores das unidades operacionais
		var unidadesOperacionais = JSON.parse(localStorage.getItem("unidadesOperacionais"));
		mapview.unidadesOperacionais = [];
		for ( var u = 0; u < unidadesOperacionais.length; u++ ){
			unidade = unidadesOperacionais[u];
			if ( ! (unidade[8] == 1 || unidade[8] == 5) ) continue;
			popup = "<p><em>"+unidade[3]+"</em><br><strong>"+unidade[2]+"</strong><br>"
			if ( unidade[4] != "" ) popup += "Telefone: "+unidade[4]+"<br>"
			if ( unidade[5] != "" ) popup += "Email: <a href=\"mailto:"+unidade[5]+"\">"+unidade[5]+"</a><br>"
			popup += "</p>";
			marker = new L.marker([unidade[6], unidade[7]], {
				icon: L.icon({
					iconUrl: "leaflet/images/marker-"+unidade[8]+".png",
					iconSize: [25, 41],
					iconAnchor: [12.5, 41],
					popupAnchor: [0, -48],
					shadowUrl: "leaflet/images/marker-shadow.png",
					shadowSize: [41, 41],
					shadowAnchor: [13, 41]
				})
			}).bindPopup(popup);
			mapview.unidadesOperacionais.push([unidade[8], marker]);
		}
		mapview.marcar();
	}
	// Marcadores das unidades operacionais
	if ( ! localStorage.getItem("unidadesOperacionais") ){
		localStorage.setItem("unidadesOperacionais", "[]");
		$.get("/ocorrencias/unidades", function(data){ 
			/*
			 * Solicitar ao servidor a localização 
			 * das Unidades Operacionais
			 */
			localStorage.setItem("unidadesOperacionais", JSON.stringify(data.result));
			criarUnidades();
		}, 'json');
	}
	else {
		criarUnidades();
	}
	
	// Redraw heatmap on dimension or map changes
	$(window).on( "resize", function(event){
		var mapHeight = $(window).height() - ($("div[data-role='header']").first().height()+$("div[data-role='footer']").first().height()+2);
		$("div#map").height(mapHeight);
		$("div#preferences-content").height($(window).height() - 30);
		$("div#preferences").trigger("updatelayout");
		mapview.preserve();
	});
	map.on('moveend', function(event) {
		console.log("Redesenhando mapa...");
		mapview.redraw();
		mapview.preserve();
	});

	$( "#radius" ).on("slidestop", function(event){
		mapview.radius = 102 - 10 * $(this).val();
		mapview.redraw();
		mapview.preserve();
	});

	$( "#opacity" ).on("change", function(event){
		mapview.opacity = $(this).val() / 10;
		mapview.canvas.setOpacity($(this).val() / 10);
		mapview.preserve();
	});

	$("#set-center").on("click", function(event){
		if ("geolocation" in navigator) {
			// geolocation is available 
			$("#footer-info").html("Identificando local atual...");
			navigator.geolocation.getCurrentPosition(function(position) {
				console.log("Centralizando o mapa na posição atual...");
				latitude = position.coords.latitude; 
				longitude = position.coords.longitude;
				var center = new L.LatLng(latitude, longitude);
				popup = "<p>Minha última localização<br><a href=\"remove\" id=\"remove-local\">Remover marcador</a></p>";
				mapview.map.removeLayer(mapview.local);
				mapview.local = new L.marker([latitude, longitude], {
					icon: L.icon({
						iconUrl: "leaflet/images/marker-icon.png",
						iconSize: [25, 41],
						iconAnchor: [12.5, 41],
						popupAnchor: [0, -48],
						shadowUrl: "leaflet/images/marker-shadow.png",
						shadowSize: [41, 41],
						shadowAnchor: [13, 41]
					})
				}).bindPopup(popup);
				mapview.local.addTo(mapview.map);
				mapview.map.setView(center, mapview.map.getZoom());
				mapview.preserve();
			}, function(){
				// Geolocation denied, use default position
				$("#set-center-popup").popup("open", {transition: "fade"});
			});
		} 
		else {
			$("#set-center-popup").popup("open", {transition: "fade"});
		}
	});

	$(document).on("click", "#remove-local", function(event){
		event.preventDefault();
		mapview.map.removeLayer(mapview.local);
	});

	$("#cancel-date-range").on("click", function(event){
		$("#date-from").val(mapview.dateFrom);
		$("#date-to").val(mapview.dateTo);
	});
	$("#set-date-range").on("click", function(event){
		console.log("Ocorrências entre: ", $("#date-from").val(), $("#date-to").val());
		// Validate dates
		if ( isNaN(parseInt(new Date($("#date-from").val()).getTime()/1000)) ){
			$("#date-range-popup > p").html("Data inicial inválida");
			$("#date-range-popup").popup("open", {transition: "fade"});
			return;
		}
		if ( isNaN(parseInt(new Date($("#date-to").val()).getTime()/1000)) ){
			$("#date-range-popup > p").html("Data final inválida");
			$("#date-range-popup").popup("open", {transition: "fade"});
			return;
		}
		mapview.dateFrom = $("#date-from").val();
		mapview.dateTo = $("#date-to").val();
		mapview.reload();
		mapview.preserve();
	});

	$("select[data-tipo=unidade]").on("slidestop", function(event, ui) {
		mapview.marcar();
		mapview.preserve();
	});
}

/*
 * Start database and launch map app
 */
$(function(){
	var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
	if ( typeof indexedDB == 'undefined' ){
		$("div#map > h1").html("Seu navegador não é compatível ou está desatualizado. Dica: utilize <a href=\"https://www.mozilla.org/pt-BR/firefox/new/\">Mozilla Firefox</a>");
		console.log("Navegador incompatível, encerrando...");
	}
	else {
		$.mobile.loading("show");
		initDB(initStart);
	}
});

/* Google Analytics */
(function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
(i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
})(window,document,'script','//www.google-analytics.com/analytics.js','ga');
ga('create', 'UA-44398565-1', 'lcnsqr.com');
ga('send', 'pageview');
