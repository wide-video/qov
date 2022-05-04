export const assetImage = "/asset/bbb_1920x1080.png";
export const assetVideo = "/asset/bbb_av1_640x360_25fps_aac_stereo_5s_0MB.mp4";

/*
const printRGBA = (source:ArrayBuffer) => {
	const dv = new DataView(source);
	for(let i = 0; i < source.byteLength; i += 4)
		console.log("0x" + dv.getUint32(i).toString(16).padStart(8, "0"));
}
*/

export const fetchToCanvas = async (url:string, canvas:HTMLCanvasElement):Promise<void> => {
	return new Promise(resolve => {
		const image = new Image();
		image.onload = () => {
			canvas.width = image.naturalWidth;
			canvas.height = image.naturalHeight;
			const ctx = canvas.getContext("2d")!;
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0);
			resolve();
		}
		image.src = url;
	})
}

export const fetchFrames = async (url:string, canvas:HTMLCanvasElement, maxFrames:number,
	onProgress?:(frame:number, progress:number)=>any):Promise<VideoFrames> => new Promise(resolve => {
	const frames:Blob[] = [];
	let width = 0;
	let height = 0;
	let frameRate = 0;
	const video = document.createElement("video");
	video.addEventListener("ended", () => resolve({width, height, frames, frameRate}));
	video.src = url;
	video.muted = true;
	const drawingLoop = () => {
		onProgress?.(maxFrames
			? (frames.length + 1) / maxFrames
			: frames.length + 1, video.currentTime / video.duration);
		video.pause();
		width = canvas.width = video.videoWidth;
		height = canvas.height = video.videoHeight
		frameRate = (frames.length + 1) / video.currentTime;
		const ctx = canvas.getContext("2d")!;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(video, 0, 0);
		frames.push(new Blob([ctx.getImageData(0, 0, width, height).data]));
		if(frames.length === maxFrames)
			return resolve({width, height, frames, frameRate});
		(<any>video).requestVideoFrameCallback(drawingLoop);
		video.play();
	}
	(<any>video).requestVideoFrameCallback(drawingLoop);
	video.play();
})

export const compare = (a:ArrayBuffer, b:ArrayBuffer):boolean => {
	if(a.byteLength !== b.byteLength)
		return false;
	const aa = new Uint8Array(a);
	const ba = new Uint8Array(b);
	for(let i = 0; i < a.byteLength; i++)
		if(aa[i] !== ba[i])
			return false;
	return true;
}

export const sha256Bytes = async (source:ArrayBuffer):Promise<string> => {
	const digest = await crypto.subtle.digest("SHA-256", source);
	const resultBytes = [...new Uint8Array(digest)];
	return resultBytes.map(x => x.toString(16).padStart(2, '0')).join("");
}

export const log = (message:string | HTMLElement, element:HTMLElement) => {
	console.log(message);
	const isBottom = element.scrollTop === (element.scrollHeight - element.clientHeight);
	if(typeof message === "string") {
		const row = document.createElement("p");
		row.innerHTML = message;
		element.append(row);
	} else {
		element.append(message);
	}
	if(isBottom)
		element.scrollTop = element.scrollHeight;
}

export async function saveFile(file:File) {
	try {
		const handle = await (<any>window).showSaveFilePicker({suggestedName:file.name});
		const writable = await handle.createWritable();
		await writable.write(file);
		await writable.close();
	} catch(error) {}
}

type VideoFrames = {
	readonly width:number;
	readonly height:number;
	readonly frameRate:number;
	readonly frames:ReadonlyArray<Blob>;
}