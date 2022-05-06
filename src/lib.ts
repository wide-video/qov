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

export const readRGBA = (ctx:CanvasRenderingContext2D) =>
	ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data.buffer

export const readFrames = async (url:string, canvas:HTMLCanvasElement, maxFrames:number,
	onFrame:(frame:ArrayBuffer, width:number, height:number, progress:number)=>any)
	:Promise<void> => new Promise(resolve => {
	const video = document.createElement("video");
	const requestFrame:Function | undefined = (<any>video).requestVideoFrameCallback?.bind(video);
	const complete = () => {
		video.removeEventListener("timeupdate", render);
		video.pause();
		video.removeAttribute("src");
		video.load();
		resolve();
	}
	video.addEventListener("ended", () => complete());

	video.src = url;
	video.muted = true;
	let frames = 0;
	const render = () => {
		video.pause();
		const width = canvas.width = video.videoWidth;
		const height = canvas.height = video.videoHeight
		const progress = maxFrames
			? frames++ / maxFrames
			: video.currentTime / video.duration
		const ctx = canvas.getContext("2d")!;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(video, 0, 0);
		onFrame(readRGBA(ctx), width, height, progress);
		if(frames === maxFrames)
			return complete();
		requestFrame?.(render);
		video.play();
	}
	if(!requestFrame)
		video.addEventListener("timeupdate", render);
	requestFrame?.(render);
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
