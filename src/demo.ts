import * as Dev from "./Dev";
import * as QOI from "./QOI";

(async () => {
	const canvas = document.createElement("canvas");
	document.body.append(canvas);
	
	const canvas2 = document.createElement("canvas");
	document.body.append(canvas2);

	const logElement = document.createElement("pre");
	document.body.append(logElement);

	await Dev.fetchToCanvas("/asset/bbb_1920x1080.png", canvas);	
	const rgba = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data.buffer;

	const t0 = performance.now();
	const qoi = QOI.encode({width:canvas.width, height:canvas.height, channels:4, colorspace:0, data:rgba});
	const t1 = performance.now();
	const rgba_decoded = QOI.decode(qoi);
	const t2 = performance.now();
	
	Dev.log(`encode toook ${t1-t0|0}ms`, logElement);
	Dev.log(`decode toook ${t2-t1|0}ms`, logElement);
	Dev.log(`rgba ${rgba.byteLength/1024|0}kB`, logElement);
	Dev.log(`qoi ${qoi.byteLength/1024|0}kB`, logElement);
	Dev.log(`result: ${Dev.compare(rgba, rgba_decoded.data)}`, logElement);

	for(let i = 0; i < 10; i++) {
		const t3 = performance.now();
		QOI.decode(qoi);
		const t4 = performance.now();
		Dev.log(`performance #${i+1}: ${t4-t3|0}ms`, logElement);
	}

	canvas2.width = rgba_decoded.width;
	canvas2.height = rgba_decoded.height;
	const ctx2 = canvas2.getContext("2d")!;
	ctx2.putImageData(new ImageData(new Uint8ClampedArray(rgba_decoded.data), canvas2.width, canvas2.height), 0, 0);
})()