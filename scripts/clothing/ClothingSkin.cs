using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using CodeWalker.Utils;
using SharpDX;

public static class ClothingSkin {
 static readonly string[] Lods={"high","medium","low","verylow"};
 static Dictionary<string,int> Uncertain=new Dictionary<string,int>();
 static Dictionary<string,List<bool[]>> Unknown=new Dictionary<string,List<bool[]>>();
 class UvFace {public Vector2[] Points;public bool Skin;public string Material;}
 static DrawableModel[] Models(Drawable d,string lod){return lod=="high"?d.DrawableModels.High:lod=="medium"?d.DrawableModels.Med:lod=="low"?d.DrawableModels.Low:d.DrawableModels.VLow;}
 static void SetModels(Drawable d,string lod,DrawableModel[] models){if(lod=="high")d.DrawableModels.High=models;else if(lod=="medium")d.DrawableModels.Med=models;else if(lod=="low")d.DrawableModels.Low=models;else d.DrawableModels.VLow=models;}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static Vector3 Vec(VertexData v,int i,int c){switch(v.Info.GetComponentType(c)){case VertexComponentType.Float3:case VertexComponentType.Float4:return v.GetVector3(i,c);case VertexComponentType.Dec3N:return v.GetDec3N(i,c);case VertexComponentType.Half4:var h=v.GetHalf4(i,c);return new Vector3((float)h.X,(float)h.Y,(float)h.Z);default:throw new Exception("Formato de vetor não suportado nesta peça.");}}
 static Vector2 UV(VertexData v,int i){if(v.Info.GetComponentType(6)==VertexComponentType.Float2)return v.GetVector2(i,6);if(v.Info.GetComponentType(6)==VertexComponentType.Half2){var h=v.GetHalf2(i,6);return new Vector2((float)h.X,(float)h.Y);}throw new Exception("UV principal não suportado.");}
 static string Point(Vector3 p){return string.Join(",",new[]{p.X,p.Y,p.Z}.Select(v=>Math.Floor((double)v*10000+0.5).ToString(System.Globalization.CultureInfo.InvariantCulture)));}
 static string Triangle(VertexData v,ushort[] ids,int at){var points=new[]{Point(Vec(v,ids[at],0)),Point(Vec(v,ids[at+1],0)),Point(Vec(v,ids[at+2],0))};Array.Sort(points,StringComparer.Ordinal);return Hash(Encoding.UTF8.GetBytes(string.Join(";",points)));}
 static string Material(DrawableGeometry g){var p=g.Shader.ParametersList;for(int i=0;i<p.Parameters.Length;i++)if(p.Hashes[i].ToString().Equals("DiffuseSampler",StringComparison.OrdinalIgnoreCase)){var t=p.Parameters[i].Data as TextureBase;if(t!=null)return t.Name.ToLowerInvariant();}return "shader:"+g.ShaderID;}
 static string VertexKey(DrawableGeometry g,int vertex){var uv=UV(g.VertexData,vertex);return Material(g)+":"+Point(Vec(g.VertexData,vertex,0))+":"+Math.Floor(uv.X*10000+0.5)+","+Math.Floor(uv.Y*10000+0.5);}
 static bool Contains(Vector2 point,Vector2[] t){var a=t[1]-t[0];var b=t[2]-t[0];var p=point-t[0];double det=a.X*b.Y-a.Y*b.X;if(Math.Abs(det)<1e-12)return false;double u=(p.X*b.Y-p.Y*b.X)/det,v=(a.X*p.Y-a.Y*p.X)/det;return u>=-1e-6&&v>=-1e-6&&u+v<=1.000001;}
 static Dictionary<string,List<bool[]>> Classify(Drawable d,string source,string reference){
  var json=new JavaScriptSerializer{MaxJsonLength=16*1024*1024};var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(reference));
  string gender=Path.GetFileName(source).StartsWith("mp_f_",StringComparison.OrdinalIgnoreCase)?"female":"male";
  var known=new HashSet<string>(((System.Collections.IEnumerable)data[gender]).Cast<object>().Select(v=>(string)v));
  var skinShaders=new[]{"ped_skin.sps","ped_skin_head.sps","ped_skin_body.sps"}.Select(JenkHash.GenHash).ToArray();
  var result=new Dictionary<string,List<bool[]>>();int total=0;
  foreach(var lod in Lods){var masks=new List<bool[]>();
   foreach(var model in Models(d,lod)??new DrawableModel[0])foreach(var g in model.Geometries){
    var v=g.VertexData;var ids=g.IndexBuffer.Indices;
    if(v.VertexCount>65535||ids.Length%3!=0||ids.Any(i=>i>=v.VertexCount))throw new Exception("Malha ou índices inválidos.");
    total+=ids.Length/3;if(total>2000000)throw new Exception("Peça excede o limite de faces.");
    bool materialSkin=skinShaders.Contains(g.Shader.FileName.Hash);var mask=new bool[ids.Length/3];
    for(int face=0;face<mask.Length;face++)mask[face]=materialSkin||known.Contains(Triangle(v,ids,face*3));
    masks.Add(mask);
   }result[lod]=masks;
  }
  // Lower LODs may contain only the garment. Prove their assignment using the
  // high-LOD position+UV vertices or exclusive UV regions of the same material.
  var skinVertices=new HashSet<string>();var clothVertices=new HashSet<string>();var uvFaces=new List<UvFace>();int highGeo=0;
  foreach(var m in Models(d,"high")??new DrawableModel[0])foreach(var g in m.Geometries){var mask=result["high"][highGeo++];var ids=g.IndexBuffer.Indices;
   for(int f=0;f<mask.Length;f++){var target=mask[f]?skinVertices:clothVertices;var points=new Vector2[3];for(int c=0;c<3;c++){target.Add(VertexKey(g,ids[f*3+c]));points[c]=UV(g.VertexData,ids[f*3+c]);}uvFaces.Add(new UvFace{Points=points,Skin=mask[f],Material=Material(g)});}
  }
  Unknown=result.ToDictionary(p=>p.Key,p=>p.Value.Select(m=>new bool[m.Length]).ToList());
  Uncertain=new Dictionary<string,int>();Uncertain["high"]=0;
  foreach(var lod in Lods.Skip(1)){int gi=0,unknown=0;foreach(var m in Models(d,lod)??new DrawableModel[0])foreach(var g in m.Geometries){var mask=result[lod][gi++];var ids=g.IndexBuffer.Indices;
   for(int f=0;f<mask.Length;f++)if(!mask[f]){
    var keys=new[]{VertexKey(g,ids[f*3]),VertexKey(g,ids[f*3+1]),VertexKey(g,ids[f*3+2])};bool allSkin=keys.All(skinVertices.Contains),allCloth=keys.All(clothVertices.Contains);
    if(allSkin&&!allCloth){mask[f]=true;continue;}if(allCloth&&!allSkin)continue;
    var t=new[]{UV(g.VertexData,ids[f*3]),UV(g.VertexData,ids[f*3+1]),UV(g.VertexData,ids[f*3+2])};var samples=new[]{(t[0]+t[1]+t[2])/3,t[0]*.6f+t[1]*.2f+t[2]*.2f,t[1]*.6f+t[0]*.2f+t[2]*.2f,t[2]*.6f+t[0]*.2f+t[1]*.2f};
    bool onlySkin=true,onlyCloth=true;
    foreach(var sample in samples){bool hasSkin=false,hasCloth=false;foreach(var face in uvFaces)if(face.Material==Material(g)&&Contains(sample,face.Points)){if(face.Skin)hasSkin=true;else hasCloth=true;}onlySkin&=hasSkin&&!hasCloth;onlyCloth&=hasCloth&&!hasSkin;}
    if(onlySkin)mask[f]=true;else if(!onlyCloth){unknown++;Unknown[lod][gi-1][f]=true;}
   }
  }Uncertain[lod]=unknown;}
  return result;
 }
 static object[] Counts(Dictionary<string,List<bool[]>> masks){return Lods.Select(lod=>new {lod,skin=masks[lod].Sum(m=>m.Count(v=>v)),cloth=masks[lod].Sum(m=>m.Count(v=>!v))-Uncertain[lod],uncertain=Uncertain[lod]}).Cast<object>().ToArray();}
 static void ApplyOverrides(Dictionary<string,List<bool[]>> masks,string file){
  var values=new JavaScriptSerializer{MaxJsonLength=8*1024*1024}.Deserialize<Dictionary<string,string>>(File.ReadAllText(file));
  foreach(var entry in values){var parts=entry.Key.Split(':');int g,f;if(parts.Length!=3||!masks.ContainsKey(parts[0])||!int.TryParse(parts[1],out g)||!int.TryParse(parts[2],out f)||g<0||g>=masks[parts[0]].Count||f<0||f>=masks[parts[0]][g].Length||(entry.Value!="skin"&&entry.Value!="cloth"))throw new Exception("Seleção de faces inválida. Refaça a análise.");masks[parts[0]][g][f]=entry.Value=="skin";Unknown[parts[0]][g][f]=false;}
  foreach(var lod in Lods)Uncertain[lod]=Unknown[lod].Sum(m=>m.Count(v=>v));
 }
 static void RequireMixed(Dictionary<string,List<bool[]>> masks){
  if(masks["high"].Sum(m=>m.Count(v=>v))==0)throw new Exception("Pele não identificada com segurança. Nenhum arquivo foi criado.");
  if(masks["high"].Sum(m=>m.Count(v=>!v))==0)throw new Exception("A peça contém somente pele reconhecida; não há roupa para separar.");
  foreach(var lod in Lods)if(Uncertain[lod]>0)throw new Exception("Há faces ambíguas no LOD "+lod+". A separação foi bloqueada para preservar a peça.");
 }
 static string Shader(ShaderFX shader){var text=new StringBuilder();shader.WriteXml(text,0);return text.ToString();}
 static string Signature(Drawable d,Dictionary<string,List<bool[]>> masks,bool skin){
  using(var ms=new MemoryStream())using(var writer=new BinaryWriter(ms)){
   foreach(var lod in Lods){writer.Write(lod);int gi=0;foreach(var model in Models(d,lod)??new DrawableModel[0])foreach(var g in model.Geometries){
    var indices=g.IndexBuffer.Indices;var selected=masks==null?Enumerable.Range(0,indices.Length/3).ToArray():Enumerable.Range(0,indices.Length/3).Where(i=>masks[lod][gi][i]==skin).ToArray();gi++;
    if(selected.Length==0)continue;var v=g.VertexData;writer.Write(Shader(g.Shader));writer.Write(v.Info.Flags);writer.Write((ulong)v.Info.Types);writer.Write(selected.Length);
    foreach(var face in selected)for(int c=0;c<3;c++)writer.Write(v.VertexBytes,indices[face*3+c]*v.Info.Stride,v.Info.Stride);
   }}return Hash(ms.ToArray());
  }
 }
 static string Rig(YddFile file){var doc=new XmlDocument();doc.XmlResolver=null;doc.LoadXml(YddXml.GetXml(file,null));return string.Join("",doc.SelectNodes("//Skeleton|//Joints").Cast<XmlNode>().Select(n=>n.OuterXml));}
 static Dictionary<string,string> Embedded(Drawable d){return (d.ShaderGroup.TextureDictionary==null?new Texture[0]:d.ShaderGroup.TextureDictionary.Textures.data_items).ToDictionary(t=>t.Name,t=>Hash(DDSIO.GetDDSFile(t)));}
 static void Compact(DrawableGeometry g,ushort[] indices){
  var old=g.VertexData;var used=indices.Distinct().OrderBy(i=>i).ToArray();var map=new Dictionary<ushort,ushort>();var bytes=new byte[used.Length*old.Info.Stride];
  for(int i=0;i<used.Length;i++){map.Add(used[i],(ushort)i);Buffer.BlockCopy(old.VertexBytes,used[i]*old.Info.Stride,bytes,i*old.Info.Stride,old.Info.Stride);}
  var v=new VertexData{Info=old.Info,VertexType=old.VertexType,VertexStride=old.Info.Stride,VertexCount=used.Length,VertexBytes=bytes};
  g.VertexData=v;g.VertexBuffer=new VertexBuffer{Flags=g.VertexBuffer.Flags,Info=v.Info,Data1=v,Data2=v,VertexStride=(ushort)v.Info.Stride,VertexCount=(uint)v.VertexCount};g.VerticesCount=(ushort)v.VertexCount;g.VertexStride=v.Info.Stride;
  g.IndexBuffer=new IndexBuffer{Indices=indices.Select(i=>map[i]).ToArray(),IndicesCount=(uint)indices.Length};g.IndicesCount=(uint)indices.Length;g.TrianglesCount=(uint)indices.Length/3;
 }
 static void Rebuild(Drawable d){
  var lo=new Vector3(float.MaxValue);var hi=new Vector3(float.MinValue);
  foreach(var lod in Lods)foreach(var m in Models(d,lod)??new DrawableModel[0]){
   var bounds=new List<AABB_s>();var ml=new Vector4(float.MaxValue);var mh=new Vector4(float.MinValue);
   foreach(var g in m.Geometries){var gl=new Vector3(float.MaxValue);var gh=new Vector3(float.MinValue);foreach(var i in g.IndexBuffer.Indices){var p=Vec(g.VertexData,i,0);gl=Vector3.Min(gl,p);gh=Vector3.Max(gh,p);}
    g.AABB=new AABB_s{Min=new Vector4(gl,0),Max=new Vector4(gh,0)};bounds.Add(g.AABB);ml=Vector4.Min(ml,g.AABB.Min);mh=Vector4.Max(mh,g.AABB.Max);lo=Vector3.Min(lo,gl);hi=Vector3.Max(hi,gh);
   }
   m.GeometriesCount1=m.GeometriesCount2=m.GeometriesCount3=(ushort)m.Geometries.Length;m.ShaderMapping=m.Geometries.Select(g=>g.ShaderID).ToArray();
   if(bounds.Count>1)bounds.Insert(0,new AABB_s{Min=ml,Max=mh});m.BoundsData=bounds.ToArray();
  }
  d.BoundingBoxMin=lo;d.BoundingBoxMax=hi;d.BoundingCenter=(lo+hi)*.5f;d.BoundingSphereRadius=(hi-lo).Length()*.5f;
  d.BuildAllModels();d.BuildVertexDecls();d.BuildRenderMasks();d.AssignGeometryShaders(d.ShaderGroup);
  d.FlagsHigh=(byte)(Models(d,"high")!=null?1:0);d.FlagsMed=(byte)(Models(d,"medium")!=null?1:0);d.FlagsLow=(byte)(Models(d,"low")!=null?1:0);d.FlagsVlow=(byte)(Models(d,"verylow")!=null?1:0);
 }
 static void Build(string input,string output,string name,Dictionary<string,List<bool[]>> masks,bool skin){
  var file=ClothingDecoder.LoadFull(input);var d=file.Drawables.Single();string expected=Signature(d,masks,skin),rig=Rig(file);var embedded=Embedded(d);
  foreach(var lod in Lods){int gi=0;var models=new List<DrawableModel>();foreach(var m in Models(d,lod)??new DrawableModel[0]){var geos=new List<DrawableGeometry>();foreach(var g in m.Geometries){var mask=masks[lod][gi++];var ids=g.IndexBuffer.Indices;var keep=Enumerable.Range(0,mask.Length).Where(i=>mask[i]==skin).SelectMany(i=>new[]{ids[i*3],ids[i*3+1],ids[i*3+2]}).ToArray();if(keep.Length==0)continue;Compact(g,keep);geos.Add(g);}m.Geometries=geos.ToArray();if(geos.Count>0)models.Add(m);}SetModels(d,lod,models.Count>0?models.ToArray():null);}
  d.Name=name;file.DrawableDict.Hashes=new[]{JenkHash.GenHash(name)};Rebuild(d);File.WriteAllBytes(output,file.Save());
  var reopened=ClothingDecoder.LoadFull(output);var check=reopened.Drawables.Single();var after=Embedded(check);
  if(Signature(check,null,skin)!=expected||Rig(reopened)!=rig)throw new Exception("Faces, atributos de vértice, materiais ou rig alterados. Saída rejeitada.");
  if(after.Count!=embedded.Count||embedded.Any(p=>!after.ContainsKey(p.Key)||after[p.Key]!=p.Value))throw new Exception("Texturas embutidas alteradas. Saída rejeitada.");
  if(check.Name!=name||reopened.DrawableDict.Hashes.Single()!=JenkHash.GenHash(name))throw new Exception("Identificação do drawable inválida.");
 }
 static object Preview(Drawable d,Dictionary<string,List<bool[]>> masks,string lod){
  var meshes=new List<object>();int gi=0;
  foreach(var m in Models(d,lod)??new DrawableModel[0])foreach(var g in m.Geometries){var v=g.VertexData;int geo=gi++;var mask=masks[lod][geo];var ids=g.IndexBuffer.Indices;
   var positions=new float[v.VertexCount*3];var normals=new float[v.VertexCount*3];var uv=new float[v.VertexCount*2];
   for(int i=0;i<v.VertexCount;i++){var p=Vec(v,i,0);var n=Vec(v,i,3);var t=UV(v,i);positions[i*3]=p.X;positions[i*3+1]=p.Y;positions[i*3+2]=p.Z;normals[i*3]=n.X;normals[i*3+1]=n.Y;normals[i*3+2]=n.Z;uv[i*2]=t.X;uv[i*2+1]=1-t.Y;}
   foreach(string role in new[]{"cloth","skin","uncertain"}){var faces=Enumerable.Range(0,mask.Length).Where(i=>(Unknown[lod][geo][i]?"uncertain":mask[i]?"skin":"cloth")==role).ToArray();var selected=faces.SelectMany(i=>new[]{(int)ids[i*3],(int)ids[i*3+1],(int)ids[i*3+2]}).ToArray();if(selected.Length>0)meshes.Add(new {positions,normals,uv,indices=selected,role,faceIds=faces.Select(i=>lod+":"+geo+":"+i).ToArray()});}
  }return new {meshes};
 }
 public static int Main(string[] args){
  Console.OutputEncoding=new UTF8Encoding(false);
  try{
   if(args.Length!=4&&args.Length!=5&&args.Length!=8&&args.Length!=9)throw new Exception("Operação de separação inválida.");
   var file=ClothingDecoder.LoadFull(args[1]);if(file.Drawables.Length!=1)throw new Exception("Esta etapa exige um drawable por YDD.");
   var d=file.Drawables.Single();var masks=Classify(d,args[1],args[2]);
   if(args.Length==5||args.Length==9)ApplyOverrides(masks,args[args.Length-1]);
   var json=new JavaScriptSerializer{MaxJsonLength=64*1024*1024};
   if(args[0]=="--inspect"&&(args.Length==4||args.Length==5)){string reason=null;try{RequireMixed(masks);}catch(Exception e){reason=e.Message;}File.WriteAllText(args[3],json.Serialize(new{lods=Counts(masks),canSplit=reason==null,reason,previews=Lods.ToDictionary(l=>l,l=>Preview(d,masks,l))}),new UTF8Encoding(false));return 0;}
   if(args[0]!="--split"||(args.Length!=8&&args.Length!=9))throw new Exception("Operação inválida.");
   RequireMixed(masks);
   Build(args[1],args[3],args[5],masks,false);Build(args[1],args[4],args[6],masks,true);
   File.WriteAllText(args[7],json.Serialize(new{lods=Counts(masks),partitionPreserved=true,attributesPreserved=true,rigPreserved=true,materialsPreserved=true,texturesPreserved=true}),new UTF8Encoding(false));return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 }
}
