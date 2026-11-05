export type SelectionTool='navigate'|'face'|'box'|'brush';
export type SelectionOperation='replace'|'add'|'subtract';
export type ScreenPoint={x:number;y:number};
export function selectionOperation(base:SelectionOperation,shift:boolean,alt:boolean):SelectionOperation{return alt?'subtract':shift?'add':base;}
export function mergeFaceSelection(previous:ReadonlySet<string>,ids:Iterable<string>,operation:SelectionOperation):Set<string>{
 const next=new Set(operation==='replace'?[]:previous);for(const id of ids)if(operation==='subtract')next.delete(id);else next.add(id);return next;
}
export function inSelectionBox(point:ScreenPoint,a:ScreenPoint,b:ScreenPoint):boolean{return point.x>=Math.min(a.x,b.x)&&point.x<=Math.max(a.x,b.x)&&point.y>=Math.min(a.y,b.y)&&point.y<=Math.max(a.y,b.y);}
export function inBrushStroke(point:ScreenPoint,a:ScreenPoint,b:ScreenPoint,radius:number):boolean{
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
 return (point.x-a.x-t*dx)**2+(point.y-a.y-t*dy)**2<=radius*radius;
}
