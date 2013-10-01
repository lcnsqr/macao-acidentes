// Worker to change direct pixel data
self.addEventListener('message', function(event){
	// Get width, height, markers and radius
	// Change colors based on the alpha value of each pixel
	for (var y = 0; y < event.data.height; y++) {
		for (var x = 0; x < event.data.width; x++) {
			var index = (y * event.data.width + x) * 4;

			// Store the alpha value of the original pixel
			var alpha = event.data.image.data[index + 3];
			
			// Ignore transparent pixels
			if ( alpha == 0 ) continue;

			// Color manipulation to generate the heatmap
			// Use the alpha value to get a color from the color array
			event.data.image.data[index]   = event.data.cores[alpha][0];
			event.data.image.data[++index] = event.data.cores[alpha][1];
			event.data.image.data[++index] = event.data.cores[alpha][2];
			event.data.image.data[++index] = 255;
		}
	}

	// Return base64 image
	self.postMessage(event.data.image);
}, false);
