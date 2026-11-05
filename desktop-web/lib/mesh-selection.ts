import type * as Three from 'three';
import {inBrushStroke,inSelectionBox,selectionOperation,type SelectionOperation,type SelectionTool,type ScreenPoint} from './face-selection';
import type {ClothingPreview} from './desktop';
export type MeshSelectionSettings={tool:SelectionTool;operation:SelectionOperation;radius:number;through:boolean;selected:ReadonlySet<string>;onSelect?:(ids:string[],operation:SelectionOperation)=>void};
type Face={id:string;vertices:Three.Vector3[];center:Three.Vector3;mesh:Three.Mesh};
type ProjectedFace=Face&ScreenPoint;
export function createMeshSelection(T:typeof Three,scene:Three.Scene,camera:Three.PerspectiveCamera,renderer:Three.WebGLRenderer,settings:()=>MeshSelectionSettings,draw:()=>void){
 const canvas=renderer.domElement,host=canvas.parentElement!;canvas.tabIndex=0;canvas.setAttribute('role','application');
 let object:Three.Group|null=null,data:ClothingPreview,faces:Face[]=[],frame=0,lastMove:PointerEvent|null=null;
 const selectedGeometry=new T.BufferGeometry(),selectedMaterial=new T.MeshBasicMaterial({color:0xffd76f,transparent:true,opacity:.38,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,depthWrite:false});
 const selectedMesh=new T.Mesh(selectedGeometry,selectedMaterial);selectedMesh.renderOrder=5;scene.add(selectedMesh);
 let edges:Three.LineSegments|null=null;
 const hoverGeometry=new T.BufferGeometry(),hoverMaterial=new T.LineBasicMaterial({color:0xffedb7,depthTest:false}),hover=new T.LineLoop(hoverGeometry,hoverMaterial);hover.renderOrder=10;hover.visible=false;scene.add(hover);
 const brush=document.createElement('div'),box=document.createElement('div');brush.className='mesh-brush';box.className='mesh-selection-box';host.append(brush,box);
 const ray=new T.Raycaster();
 const faceId=(mesh:Three.Mesh,index:number)=>{const group=mesh.geometry.groups.find(g=>index*3>=g.start&&index*3<g.start+g.count),material=Array.isArray(mesh.material)?mesh.material[group?.materialIndex||0]:mesh.material;return data.groups.find(g=>g.material===material.name)?.faceIds?.[index-(group?.start||0)/3];};
 const hitAt=(point:ScreenPoint)=>{if(!object)return;const rect=canvas.getBoundingClientRect();ray.setFromCamera(new T.Vector2(point.x/rect.width*2-1,-point.y/rect.height*2+1),camera);return ray.intersectObject(object,true).find(hit=>hit.object.visible);};
 const local=(event:PointerEvent):ScreenPoint=>{const rect=canvas.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};};
 function updateSelection(){
  const state=settings(),positions:number[]=[];for(const face of faces)if(face.mesh.visible&&state.selected.has(face.id))for(const v of face.vertices)positions.push(v.x,v.y,v.z);
  const old=selectedGeometry.getAttribute('position');if(old?.count===positions.length/3){(old as Three.BufferAttribute).copyArray(new Float32Array(positions));old.needsUpdate=true;}else{selectedGeometry.dispose();selectedGeometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));}
  selectedGeometry.computeBoundingSphere();selectedMesh.visible=positions.length>0;selectedMaterial.depthTest=!state.through;
  if(edges){scene.remove(edges);edges.geometry.dispose();(edges.material as Three.Material).dispose();edges=null;}
  if(positions.length){edges=new T.LineSegments(new T.WireframeGeometry(selectedGeometry),new T.LineBasicMaterial({color:0xffdf88,transparent:true,opacity:.85,depthTest:!state.through,depthWrite:false}));edges.renderOrder=6;scene.add(edges);}
  brush.style.width=brush.style.height=state.radius*2+'px';brush.style.display=state.tool==='brush'&&lastMove?'block':'none';canvas.style.cursor=state.tool==='navigate'?'grab':state.tool==='brush'?'none':'crosshair';hover.visible=false;draw();
 }
 function setModel(value:Three.Group|null,preview:ClothingPreview){
  cancelGesture();object=value;data=preview;faces=[];object?.updateMatrixWorld(true);
  object?.traverse(node=>{if(!(node instanceof T.Mesh))return;const p=node.geometry.getAttribute('position'),indices=node.geometry.index;
   for(let index=0;index<(indices?.count||p.count)/3;index++){const id=faceId(node,index);if(!id)continue;const vertices=[0,1,2].map(k=>node.localToWorld(new T.Vector3().fromBufferAttribute(p,indices?indices.getX(index*3+k):index*3+k)));faces.push({id,vertices,mesh:node,center:vertices[0].clone().add(vertices[1]).add(vertices[2]).divideScalar(3)});}
  });updateSelection();
 }
 type Gesture={tool:SelectionTool;start:ScreenPoint;last:ScreenPoint;operation:SelectionOperation;before:Set<string>;projected:ProjectedFace[];visible:Map<string,boolean>;pointerId:number};
 let gesture:Gesture|null=null;
 const project=()=>{camera.updateMatrixWorld();const rect=canvas.getBoundingClientRect();return faces.flatMap(face=>{if(!face.mesh.visible)return [];const p=face.center.clone().project(camera);return p.z>=-1&&p.z<=1?[{...face,x:(p.x+1)*rect.width/2,y:(1-p.y)*rect.height/2}]:[];});};
 const visible=(face:ProjectedFace,g:Gesture)=>{if(settings().through)return true;if(g.visible.has(face.id))return g.visible.get(face.id)!;const hit=hitAt(face),distance=camera.position.distanceTo(face.center),ok=!!hit&&hit.distance>=distance-Math.max(distance*1e-5,1e-6);g.visible.set(face.id,ok);return ok;};
 const applyBrush=(point:ScreenPoint)=>{if(!gesture)return;const g=gesture,state=settings(),ids=g.projected.filter(face=>inBrushStroke(face,g.last,point,state.radius)&&visible(face,g)).map(f=>f.id),hit=hitAt(point);if(hit&&hit.object instanceof T.Mesh&&hit.faceIndex!=null){const id=faceId(hit.object,hit.faceIndex);if(id)ids.push(id);}state.onSelect?.([...new Set(ids)],g.operation==='subtract'?'subtract':'add');g.last=point;};
 function cancelGesture(){if(gesture){settings().onSelect?.([...gesture.before],'replace');release();}}
 function release(){const id=gesture?.pointerId;gesture=null;box.style.display='none';if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
 function move(event:PointerEvent){
  const state=settings(),point=local(event);brush.style.left=point.x+'px';brush.style.top=point.y+'px';brush.style.display=state.tool==='brush'?'block':'none';
  if(gesture){if(gesture.tool==='brush')applyBrush(point);else if(gesture.tool==='box'){Object.assign(box.style,{display:'block',left:Math.min(point.x,gesture.start.x)+'px',top:Math.min(point.y,gesture.start.y)+'px',width:Math.abs(point.x-gesture.start.x)+'px',height:Math.abs(point.y-gesture.start.y)+'px'});}return;}
  if(state.tool==='navigate'||event.buttons){if(hover.visible){hover.visible=false;draw();}return;}
  const hit=hitAt(point);if(!hit?.face||!(hit.object instanceof T.Mesh)){if(hover.visible){hover.visible=false;draw();}return;}const p=hit.object.geometry.getAttribute('position');hoverGeometry.setFromPoints([hit.face.a,hit.face.b,hit.face.c].map(i=>hit.object.localToWorld(new T.Vector3().fromBufferAttribute(p,i))));hover.visible=true;draw();
 }
 const down=(event:PointerEvent)=>{const state=settings();if(event.button===0)canvas.focus({preventScroll:true});if(event.button!==0||!state.onSelect||state.tool==='navigate')return;event.preventDefault();event.stopImmediatePropagation();const point=local(event);gesture={tool:state.tool,start:point,last:point,operation:selectionOperation(state.operation,event.shiftKey,event.altKey),before:new Set(state.selected),projected:state.tool==='face'?[]:project(),visible:new Map(),pointerId:event.pointerId};canvas.setPointerCapture(event.pointerId);hover.visible=false;
  if(state.tool==='brush'){if(gesture.operation==='replace')state.onSelect([],'replace');applyBrush(point);}draw();
 };
 const pointerMove=(event:PointerEvent)=>{lastMove=event;if(gesture){event.preventDefault();event.stopImmediatePropagation();}if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(lastMove)move(lastMove);});};
 const up=(event:PointerEvent)=>{if(!gesture||event.button!==0)return;event.preventDefault();event.stopImmediatePropagation();if(frame){cancelAnimationFrame(frame);frame=0;}const point=local(event),g=gesture,state=settings();
  if(g.tool==='brush')applyBrush(point);else if(g.tool==='box'){const ids=g.projected.filter(face=>inSelectionBox(face,g.start,point)&&visible(face,g)).map(f=>f.id);state.onSelect?.(ids,g.operation);}else{const hit=hitAt(point),id=hit&&hit.object instanceof T.Mesh&&hit.faceIndex!=null?faceId(hit.object,hit.faceIndex):undefined;state.onSelect?.(id?[id]:[],g.operation);}release();
 };
 const leave=()=>{if(!gesture){lastMove=null;brush.style.display='none';hover.visible=false;draw();}};
 const cancel=()=>cancelGesture();
 const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&gesture){event.preventDefault();event.stopImmediatePropagation();cancelGesture();}};
 canvas.addEventListener('pointerdown',down,true);canvas.addEventListener('pointermove',pointerMove,true);canvas.addEventListener('pointerup',up,true);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);canvas.addEventListener('pointerleave',leave);document.addEventListener('keydown',escape,true);
 return{setModel,updateSelection,dispose:()=>{if(frame)cancelAnimationFrame(frame);gesture=null;canvas.removeEventListener('pointerdown',down,true);canvas.removeEventListener('pointermove',pointerMove,true);canvas.removeEventListener('pointerup',up,true);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);canvas.removeEventListener('pointerleave',leave);document.removeEventListener('keydown',escape,true);brush.remove();box.remove();scene.remove(selectedMesh,hover);selectedGeometry.dispose();selectedMaterial.dispose();hoverGeometry.dispose();hoverMaterial.dispose();if(edges){scene.remove(edges);edges.geometry.dispose();(edges.material as Three.Material).dispose();}}};
}
