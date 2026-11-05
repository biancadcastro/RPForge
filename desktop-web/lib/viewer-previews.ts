import type * as Three from 'three';
export type ViewerPreviews={model:string|null;cloth:string|null;skin:string|null};
// All thumbnails share the editor's renderer. No extra WebGL contexts or render loop.
export function captureViewerPreviews(T:typeof Three,renderer:Three.WebGLRenderer,object:Three.Group):ViewerPreviews{
 const width=640,height=500,target=new T.WebGLRenderTarget(width,height),scene=new T.Scene(),clone=object.clone(true),camera=new T.PerspectiveCamera(34,width/height,.001,100);
 target.texture.colorSpace=T.SRGBColorSpace;
 camera.up.set(0,0,1);scene.add(clone,new T.HemisphereLight(0xffffff,0x616477,2.5));const light=new T.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);
 const priorTarget=renderer.getRenderTarget(),priorViewport=renderer.getViewport(new T.Vector4()),priorColor=renderer.getClearColor(new T.Color()),priorAlpha=renderer.getClearAlpha();
 const result:ViewerPreviews={model:null,cloth:null,skin:null};
 try{for(const role of ['model','cloth','skin'] as const){
  clone.traverse(node=>{if(node instanceof T.Mesh)node.visible=role==='model'||node.userData.role===role;});clone.updateMatrixWorld(true);
  const bounds=new T.Box3();let count=0;clone.traverse(node=>{if(!(node instanceof T.Mesh)||!node.visible)return;if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();if(node.geometry.boundingBox){bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));count++;}});if(!count)continue;
  const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),extent=Math.max(size.x,size.y,size.z,.01);camera.near=extent/10000;camera.far=extent*100;camera.position.copy(center).add(new T.Vector3(extent*.08,-extent*2.1,extent*.12));camera.lookAt(center);camera.updateProjectionMatrix();
  renderer.setRenderTarget(target);renderer.setViewport(0,0,width,height);renderer.setClearColor(0x20212a,1);renderer.render(scene,camera);
  const pixels=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(target,0,0,width,height,pixels);const flipped=new Uint8ClampedArray(pixels.length);for(let y=0;y<height;y++)flipped.set(pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d')?.putImageData(new ImageData(flipped,width,height),0,0);result[role]=canvas.toDataURL('image/png');
 }}finally{renderer.setRenderTarget(priorTarget);renderer.setViewport(priorViewport);renderer.setClearColor(priorColor,priorAlpha);target.dispose();}
 return result;
}
