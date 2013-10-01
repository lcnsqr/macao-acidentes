dbName = "macao-acidentes";

var db;

var indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
var IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction;

var initDB = function(callback){

	var request = indexedDB.open(dbName, 1);

	request.onerror = function(event) {
		console.log("Sem banco de dados, encerrando aplicativo...");
	};

	request.onsuccess = function(event) {
		db = event.target.result;
		console.log("Banco de dados pronto");
		// Database ready
		callback();
	}

	request.onupgradeneeded = function(event) {
		console.log("Preparando banco de dados");
		var thisDB = event.target.result;

		localStorage.setItem("cachedMonths", "");
		try { thisDB.deleteObjectStore("ocorrencias"); }
		catch(e){ }

		var objectStore = thisDB.createObjectStore("ocorrencias", {keyPath: "id", autoIncrement: true});
		// Non unique search indexes
		objectStore.createIndex("data", "data", { unique: false });
	}
}

