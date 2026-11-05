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

public static class ClothingNeon {
 static readonly string[] Lods={"high","medium","low","verylow"};
 static DrawableModel[] Models(Drawable d,string lod){return lod=="high"?d.DrawableModels.High:lod=="medium"?d.DrawableModels.Med:lod=="low"?d.DrawableModels.Low:d.DrawableModels.VLow;}
 static string Hash(byte[] bytes){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
 static string Point(Vector3 p){return string.Join(",",new[]{p.X,p.Y,p.Z}.Select(v=>Math.Floor((double)v*10000+0.5).ToString(System.Globalization.CultureInfo.InvariantCulture)));}
 static void RefuseSkin(DrawableGeometry[] geometries,string input,string reference){
  var json=new JavaScriptSerializer{MaxJsonLength=16*1024*1024};var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(reference));
  string gender=Path.GetFileName(input).StartsWith("mp_f_",StringComparison.OrdinalIgnoreCase)?"female":"male";
  var fingerprints=new HashSet<string>(((System.Collections.IEnumerable)data[gender]).Cast<object>().Select(v=>(string)v));
  foreach(var g in geometries){var v=g.VertexData;var ids=g.IndexBuffer.Indices;
   for(int i=0;i<ids.Length;i+=3){var points=new[]{Point(Vec(v,ids[i],0)),Point(Vec(v,ids[i+1],0)),Point(Vec(v,ids[i+2],0))};Array.Sort(points,StringComparer.Ordinal);
    if(fingerprints.Contains(Hash(Encoding.UTF8.GetBytes(string.Join(";",points)))))throw new Exception("Pele identificada na peça. Use a ferramenta Separar pele antes de converter para Neon. Nenhuma saída foi criada.");
   }
  }
 }
 static int Bytes(VertexComponentType type){switch(type.ToString()){case "Float2":case "Half4":return 8;case "Float3":return 12;case "Float4":return 16;default:return 4;}}
 static Vector3 Vec(VertexData v,int i,int c){switch(v.Info.GetComponentType(c)){case VertexComponentType.Float3:case VertexComponentType.Float4:return v.GetVector3(i,c);case VertexComponentType.Dec3N:return v.GetDec3N(i,c);case VertexComponentType.Half4:var h=v.GetHalf4(i,c);return new Vector3((float)h.X,(float)h.Y,(float)h.Z);default:throw new Exception("Vetor não suportado no preset Neon.");}}
 static Vector2 UV(VertexData v,int i){if(v.Info.GetComponentType(6)==VertexComponentType.Float2)return v.GetVector2(i,6);if(v.Info.GetComponentType(6)==VertexComponentType.Half2){var h=v.GetHalf2(i,6);return new Vector2((float)h.X,(float)h.Y);}throw new Exception("Formato de UV não suportado.");}
 static string Geometry(Drawable d,uint[] originalFlags) {
  using(var ms=new MemoryStream())using(var w=new BinaryWriter(ms)){
   int gi=0;
   foreach(var lod in Lods){w.Write(lod);foreach(var m in Models(d,lod)??new DrawableModel[0])foreach(var g in m.Geometries){
    var v=g.VertexData;w.Write(v.VertexCount);foreach(var ix in g.IndexBuffer.Indices)w.Write(ix);
    uint flags=originalFlags[gi++];
    for(int c=0;c<16;c++)if(c!=4&&(flags&(1u<<c))!=0){w.Write((int)v.Info.GetComponentType(c));for(int i=0;i<v.VertexCount;i++)w.Write(v.VertexBytes,i*v.Info.Stride+v.Info.GetComponentOffset(c),Bytes(v.Info.GetComponentType(c)));}
   }}return Hash(ms.ToArray());
  }
 }
 static string Rig(YddFile file){var doc=new XmlDocument();doc.XmlResolver=null;doc.LoadXml(YddXml.GetXml(file,null));return string.Join("",doc.SelectNodes("//Skeleton|//Joints").Cast<XmlNode>().Select(n=>n.OuterXml));}
 static Dictionary<string,string> Embedded(Drawable d){return (d.ShaderGroup.TextureDictionary==null?new Texture[0]:d.ShaderGroup.TextureDictionary.Textures.data_items).ToDictionary(t=>t.Name,t=>Hash(DDSIO.GetDDSFile(t)));}
 static ShaderFX Shader(ShaderFX old,XmlNode template){
  var node=template.CloneNode(true);var sb=new StringBuilder();old.WriteXml(sb,0);var doc=new XmlDocument();doc.XmlResolver=null;doc.LoadXml("<Item>"+sb+"</Item>");
  foreach(var name in new[]{"DiffuseSampler","VolumeSampler","BumpSampler","SpecSampler"}){
   XmlNode source=doc.SelectSingleNode("/Item/Parameters/Item[@name='"+name+"']/Name"),target=node.SelectSingleNode("Parameters/Item[@name='"+name+"']");
   target.RemoveAll();var attr=target.OwnerDocument.CreateAttribute("name");attr.Value=name;target.Attributes.Append(attr);attr=target.OwnerDocument.CreateAttribute("type");attr.Value="Texture";target.Attributes.Append(attr);
   if(source!=null){var child=target.OwnerDocument.CreateElement("Name");child.InnerText=source.InnerText;target.AppendChild(child);}
  }
  var shader=new ShaderFX();shader.ReadXml(node);return shader;
 }
 static void GeometryNeon(DrawableGeometry g){
  var old=g.VertexData;
  if((old.Info.Flags&0x4f)!=0x4f)throw new Exception("Roupa sem posições, pesos, ossos, normais ou UV principal.");
  uint flags=old.Info.Flags|(1u<<4)|(1u<<7)|(1u<<14);ulong types=(ulong)old.Info.Types;
  foreach(int c in new[]{4,7,14})if((old.Info.Flags&(1u<<c))==0){ulong mask=0xFUL<<(c*4);types=(types&~mask)|((ulong)VertexDeclarationTypes.GTAV1&mask);}
  var decl=new VertexDeclaration{Flags=flags,Types=(VertexDeclarationTypes)types};decl.UpdateCountAndStride();
  if(decl.GetComponentType(4)!=VertexComponentType.Colour)throw new Exception("Canal de cor não suportado para Neon.");
  var v=new VertexData{Info=decl,VertexStride=decl.Stride,VertexType=(VertexType)decl.Flags,VertexCount=old.VertexCount,VertexBytes=new byte[old.VertexCount*decl.Stride]};
  for(int i=0;i<v.VertexCount;i++)for(int c=0;c<16;c++)if((decl.Flags&(1u<<c))!=0){
   if((old.Info.Flags&(1u<<c))!=0)Buffer.BlockCopy(old.VertexBytes,i*old.Info.Stride+old.Info.GetComponentOffset(c),v.VertexBytes,i*decl.Stride+decl.GetComponentOffset(c),Bytes(old.Info.GetComponentType(c)));
   else if(c==7)v.SetVector2(i,c,new Vector2(1,-1));
  }
  for(int i=0;i<v.VertexCount;i++)v.SetColour(i,4,new Color(255,185,255,0));
  if((old.Info.Flags&(1u<<14))==0){
   var tangents=new Vector3[v.VertexCount];var ids=g.IndexBuffer.Indices;
   for(int i=0;i<ids.Length;i+=3){int a=ids[i],b=ids[i+1],c=ids[i+2];var e1=Vec(v,b,0)-Vec(v,a,0);var e2=Vec(v,c,0)-Vec(v,a,0);var d1=UV(v,b)-UV(v,a);var d2=UV(v,c)-UV(v,a);float det=d1.X*d2.Y-d1.Y*d2.X;if(Math.Abs(det)<1e-12f)continue;var t=(e1*d2.Y-e2*d1.Y)/det;tangents[a]+=t;tangents[b]+=t;tangents[c]+=t;}
   for(int i=0;i<v.VertexCount;i++){var n=Vec(v,i,3);n.Normalize();var t=tangents[i]-n*Vector3.Dot(n,tangents[i]);if(t.LengthSquared()<1e-12f)t=Vector3.Cross(n,Math.Abs(n.Z)<.9f?Vector3.UnitZ:Vector3.UnitY);t.Normalize();v.SetVector4(i,14,new Vector4(t,1));}
  }
  g.VertexData=v;g.VertexBuffer=new VertexBuffer{Flags=g.VertexBuffer.Flags,Info=v.Info,Data1=v,Data2=v,VertexStride=(ushort)v.Info.Stride,VertexCount=(uint)v.VertexCount};g.VertexStride=v.Info.Stride;
 }
 public static int Main(string[] args){
  try {
   if(args.Length!=5)throw new Exception("Informe origem, destino, nome interno, preset e referência de verificação.");
   var file=ClothingDecoder.LoadFull(args[0]);
   if(file.Drawables.Length!=1)throw new Exception("Esta etapa exige um drawable por YDD.");
   var d=file.Drawables[0];
   var blocked=new[]{"ped_skin.sps","ped_skin_head.sps","ped_skin_body.sps"}.Select(JenkHash.GenHash).ToArray();
   if(d.ShaderGroup.Shaders.data_items.Any(s=>blocked.Contains(s.FileName.Hash)))throw new Exception("Pele identificada. Use Separar pele antes de converter para Neon.");
   var geos=Lods.SelectMany(l=>Models(d,l)??new DrawableModel[0]).SelectMany(m=>m.Geometries).ToArray();
   RefuseSkin(geos,args[0],args[4]);
   var flags=geos.Select(g=>g.VertexData.Info.Flags).ToArray();var before=Geometry(d,flags);var rig=Rig(file);var embedded=Embedded(d);
   var templateDoc=new XmlDocument();templateDoc.XmlResolver=null;templateDoc.Load(args[3]);
   for(int i=0;i<d.ShaderGroup.Shaders.data_items.Length;i++)d.ShaderGroup.Shaders.data_items[i]=Shader(d.ShaderGroup.Shaders.data_items[i],templateDoc.DocumentElement);
   foreach(var g in geos)GeometryNeon(g);
   d.Name=args[2];file.DrawableDict.Hashes=new[]{JenkHash.GenHash(d.Name)};
   d.BuildAllModels();d.BuildVertexDecls();d.BuildRenderMasks();d.AssignGeometryShaders(d.ShaderGroup);
   File.WriteAllBytes(args[1],file.Save());
   var reopened=ClothingDecoder.LoadFull(args[1]);var check=reopened.Drawables.Single();
   if(Geometry(check,flags)!=before||Rig(reopened)!=rig)throw new Exception("Geometria, UVs, pesos ou esqueleto mudaram. Saída rejeitada.");
   var after=Embedded(check);if(embedded.Count!=after.Count||embedded.Any(p=>!after.ContainsKey(p.Key)||after[p.Key]!=p.Value))throw new Exception("Texturas embutidas mudaram. Saída rejeitada.");
   if(check.Name!=args[2]||reopened.DrawableDict.Hashes.Single()!=JenkHash.GenHash(args[2])||check.ShaderGroup.Shaders.data_items.Any(s=>s.FileName.Hash!=0x1A0AEADA))throw new Exception("Preset ou identificação Neon inválidos.");
   foreach(var g in Lods.SelectMany(l=>Models(check,l)??new DrawableModel[0]).SelectMany(m=>m.Geometries))for(int i=0;i<g.VertexData.VertexCount;i++){var c=g.VertexData.GetColour(i,4);if(c.R!=255||c.G!=185||c.B!=255||c.A!=0)throw new Exception("Cor de vértice Neon não foi preservada.");}
   var report=new {geometryPreserved=true,rigPreserved=true,embeddedPreserved=true,shader="ped_emissive.sps",lods=Lods.Select(l=>new {lod=l,vertices=(Models(check,l)??new DrawableModel[0]).Sum(m=>m.Geometries.Sum(g=>g.VertexData.VertexCount)),triangles=(Models(check,l)??new DrawableModel[0]).Sum(m=>m.Geometries.Sum(g=>g.IndexBuffer.Indices.Length/3))})};
   Console.WriteLine(new JavaScriptSerializer().Serialize(report));return 0;
  }catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 }
}
