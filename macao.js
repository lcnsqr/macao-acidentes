/*
   macao.js
   
   Copyright 2013 Luciano Siqueira <lcnsqr@gmail.com>
   
   This program is free software; you can redistribute it and/or modify
   it under the terms of the GNU General Public License as published by
   the Free Software Foundation; either version 2 of the License, or
   (at your option) any later version.
   
   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   
   You should have received a copy of the GNU General Public License
   along with this program; if not, write to the Free Software
   Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
   MA 02110-1301, USA.
   
*/

// Generate gradient
var cores = [];

// 256 colors, so 64 to each color interval
var stops = [
	[  0,   0, 255], // blue
	[  0, 255, 255], // cyan
	[  0, 255,   0], // green
	[255, 255,   0], // yellow
	[255,   0,   0]  // red
];

// Sum step to get to the next stop
var sum = [
	[0,  4,  0],
	[0,  0, -4],
	[4,  0,  0],
	[0, -4,  0]
];

for(s=0; s<4; s++){
	// Add color stop
	cores.push(stops[s]);
	// Transition to the next color stop
	for(c=0; c<63; c++){
		r=cores[cores.length-1][0]+sum[s][0];
		g=cores[cores.length-1][1]+sum[s][1];
		b=cores[cores.length-1][2]+sum[s][2];
		cores.push([r,g,b]);
	}
}

// Generate heatmap from points set
var Macao = function(width, height, markers){

	// Circle radius
	this.radius = 20;

	// Plot coords
	this.markers = markers;
	
	this.canvas = document.createElement('canvas');
	this.canvas.width = width;
	this.canvas.height = height;
	this.ctx = this.canvas.getContext("2d");
	
	// The alpha value for a single event stamp
	this.stampAlpha = 1;

	this.canvasMask = document.createElement('canvas');
	this.canvasMask.width = this.canvas.width;
	this.canvasMask.height = this.canvas.height;
	this.ctxMask = this.canvasMask.getContext("2d");

};
Macao.prototype = {
	clear: function(){
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctxMask.clearRect(0, 0, this.canvasMask.width, this.canvasMask.height);
	},
	plot: function(callback) {
		// Draw circles on canvas element
		// based on translated map coords
		this.clear();

		// Create a reduced resolution array, based on the size of the marker radius.
		// The larger the radius, the lowest the resolution will be,
		// in a logarithmic scale. Close markers will be at the same
		// coordinates on the lower resolution array.
		var width = Math.round(this.canvas.width/Math.log(this.radius));
		var height = Math.round(this.canvas.height/Math.log(this.radius));
		// Initialize array with all values to zero
		var board = [];
		var size = width*height;
		// Don't punch twice at the exact same spot
		var punch = [];
		// If no markers overlap each other, the alpha channel will be opaque
		var max = 1;
		for ( var m = 0, mmax = this.markers.length; m < mmax; m++ ) {
			var x = Math.round(this.markers[m][0] / this.canvas.width * width);
			var y = Math.round(this.markers[m][1] / this.canvas.height * height);
			var index = (y * width + x);
			// Out of bounds
			if ( index < 0 || index >= size ) continue;
			// Already punched?
			var punchIndex = this.markers[m][1] * this.canvas.width + this.markers[m][0];
			if ( typeof punch[punchIndex] != "undefined" ) continue;
			punch[punchIndex] = 1;
			// Store the highest overlapped markers ocurrences
			if ( typeof board[index] == "undefined" ) {
				board[index] = 1;
			}
			else {
				board[index]++;
			}
			if ( board[index] > max ) max = board[index];
		}
		this.stampAlpha = 1 / max;

		// The greyscale semi-transparent radial gradients
		for ( var m = 0, mmax = this.markers.length; m < mmax; m++ ) {
			var marker = this.markers[m];
			// Don't punch twice at the exact same spot
			var punchIndex = marker[1] * this.canvas.width + marker[0];
			if ( punch[punchIndex] > 1 ) continue;
			punch[punchIndex]++;

			// Out of bounds
			if ( marker[0] < 0 || marker[1] < 0 || marker[0] >= this.canvas.width || marker[1] >= this.canvas.height ) continue;
			// Fill each marker with a white to transparent radial gradient
			var radialGradient = this.ctx.createRadialGradient(marker[0], marker[1], 1, marker[0], marker[1], this.radius);
			radialGradient.addColorStop(0, 'rgba(255,255,255,'+this.stampAlpha+')');
			radialGradient.addColorStop(1, 'rgba(255,255,255,0)');
			this.ctx.beginPath();
			this.ctx.arc(marker[0], marker[1], this.radius, 0, Math.PI * 2, false);
			this.ctx.fillStyle = radialGradient;
			this.ctx.fill();
			this.ctx.closePath();

			// Mask to soften edges
			var radialGradientMask = this.ctxMask.createRadialGradient(marker[0], marker[1], this.radius/12, marker[0], marker[1], this.radius);
			radialGradientMask.addColorStop(0, 'rgb(255,255,255)');
			radialGradientMask.addColorStop(1, 'rgba(255,255,255,0)');
			this.ctxMask.beginPath();
			this.ctxMask.arc(marker[0], marker[1], this.radius, 0, Math.PI * 2, false);
			this.ctxMask.fillStyle = radialGradientMask;
			this.ctxMask.fill();
			this.ctxMask.closePath();
		};
		var imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

		// Change pixels on background process
		var plotter = new Worker('plotter.js');
		mapacalor = this;
		plotter.addEventListener('message', function(event) {
			// Draw heatmap colors
			mapacalor.ctx.putImageData(event.data, 0, 0);

			// Combine mask
			mapacalor.ctx.globalCompositeOperation = "destination-in";
			mapacalor.ctx.drawImage(mapacalor.canvasMask, 0, 0);

			// Return to the document
			callback(mapacalor.canvas.toDataURL());
		}, false);

		// Send data to our worker.
		plotter.postMessage({
			width: this.canvas.width,
			height: this.canvas.height,
			image: imageData,
			cores: cores
		}); 
	}
}
