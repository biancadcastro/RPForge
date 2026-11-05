// Read-only adapter for CodeWalker.Core. Never saves or modifies game resources.
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using CodeWalker.Utils;

public static class ClothingDecoder {
 public static YddFile LoadFull(string file) {
  var bytes=File.ReadAllBytes(file);var ydd=new YddFile();ydd.Load(bytes);
  var reader=Reader(bytes,165);
  foreach(var d in ydd.Drawables)if(d.ShaderGroup.TextureDictionary!=null)Fill(reader,d.ShaderGroup.TextureDictionary.Textures.data_items);
  return ydd;
 }
 static int TextureBytes(Texture t) {
  int size=0,w=t.Width,h=t.Height;
  for(int level=0;level<t.Levels;level++) {
   switch(t.Format) {
    case TextureFormat.D3DFMT_DXT1: case TextureFormat.D3DFMT_ATI1: size+=Math.Max(1,(w+3)/4)*Math.Max(1,(h+3)/4)*8;break;
    case TextureFormat.D3DFMT_DXT3: case TextureFormat.D3DFMT_DXT5: case TextureFormat.D3DFMT_ATI2: case TextureFormat.D3DFMT_BC7: size+=Math.Max(1,(w+3)/4)*Math.Max(1,(h+3)/4)*16;break;
    case TextureFormat.D3DFMT_A8R8G8B8: case TextureFormat.D3DFMT_X8R8G8B8: case TextureFormat.D3DFMT_A8B8G8R8: size+=w*h*4;break;
    case TextureFormat.D3DFMT_A1R5G5B5:size+=w*h*2;break;
    case TextureFormat.D3DFMT_A8:case TextureFormat.D3DFMT_L8:size+=w*h;break;
    default:throw new Exception("Formato de textura não suportado: "+t.Format);
   }
   w=Math.Max(1,w/2);h=Math.Max(1,h/2);
  }
  if(size<=0||size>128*1024*1024)throw new Exception("Textura excede o limite de leitura.");
  return size;
 }
 static ResourceDataReader Reader(byte[] bytes,uint version) {
  var copy=(byte[])bytes.Clone();var entry=RpfFile.CreateResourceFileEntry(ref copy,version);
  return new ResourceDataReader(entry,ResourceBuilder.Decompress(copy));
 }
 static void Fill(ResourceDataReader reader,IEnumerable<Texture> textures) {
  foreach(var t in textures) {if(t.Width<1||t.Height<1||t.Width>16384||t.Height>16384||t.Depth!=1)throw new Exception("Dimensões de textura não suportadas.");reader.Position=(long)t.DataPointer;t.Data.FullData=reader.ReadBytes(TextureBytes(t));}
 }
 static SharpDX.Vector3 Vector(VertexData data,int v,int c) {
  switch(data.Info.GetComponentType(c)) {
   case VertexComponentType.Dec3N:return data.GetDec3N(v,c);
   case VertexComponentType.Half4:var h=data.GetHalf4(v,c);return new SharpDX.Vector3((float)h.X,(float)h.Y,(float)h.Z);
   case VertexComponentType.Float3:case VertexComponentType.Float4:return data.GetVector3(v,c);
   default:throw new Exception("Formato de vértice não suportado: "+data.Info.GetComponentType(c));
  }
 }
 static DrawableModel[] Models(Drawable d,string lod) {
  switch(lod){case "high":return d.DrawableModels.High;case "medium":return d.DrawableModels.Med;case "low":return d.DrawableModels.Low;case "verylow":return d.DrawableModels.VLow;default:throw new Exception("LOD inválido.");}
 }
 public static int Main(string[] args) {
  try {
   if(args.Length!=4)throw new Exception("Informe YDD, YTD (ou vazio), pasta temporária e LOD.");
   string modelPath=args[0],texturePath=args[1],output=args[2],lod=args[3];
   var bytes=File.ReadAllBytes(modelPath);var ydd=new YddFile();ydd.Load(bytes);
   if(ydd.Drawables==null||ydd.Drawables.Length==0)throw new Exception("YDD sem drawables.");
   var yddReader=Reader(bytes,165);
   var external=new Dictionary<string,Texture>(StringComparer.OrdinalIgnoreCase);
   if(texturePath!="") {
    var tb=File.ReadAllBytes(texturePath);var ytd=new YtdFile();ytd.Load(tb);
    var textures=ytd.TextureDict.Textures.data_items;Fill(Reader(tb,13),textures);
    foreach(var t in textures){if(external.ContainsKey(t.Name))throw new Exception("Nome de textura duplicado no YTD.");external.Add(t.Name,t);}
   }
   var meshes=new List<object>();var maps=new List<object>();var exported=new Dictionary<Texture,string>();
   int vertices=0,triangles=0;
   for(int di=0;di<ydd.Drawables.Length;di++) {
    var drawable=ydd.Drawables[di];var embedded=drawable.ShaderGroup.TextureDictionary;
    var local=new Dictionary<string,Texture>(StringComparer.OrdinalIgnoreCase);
    if(embedded!=null&&embedded.Textures!=null){Fill(yddReader,embedded.Textures.data_items);foreach(var t in embedded.Textures.data_items){if(local.ContainsKey(t.Name))throw new Exception("Textura embutida duplicada.");local.Add(t.Name,t);}}
    var models=Models(drawable,lod);
    if(models==null||models.Length==0)throw new Exception("Drawable "+di+" não possui o LOD escolhido. Selecione outro LOD.");
    foreach(var model in models)foreach(var geo in model.Geometries) {
     var data=geo.VertexData;var indices=geo.IndexBuffer.Indices;
     if(data==null||indices==null||indices.Length==0||indices.Length%3!=0)throw new Exception("Malha ou índices inválidos.");
     if((data.Info.Flags&(1u<<3))==0||(data.Info.Flags&(1u<<6))==0)throw new Exception("Malha sem normais ou UV principal.");
     vertices+=data.VertexCount;triangles+=indices.Length/3;
     if(vertices>1000000||triangles>2000000)throw new Exception("Peça excede o limite de geometria.");
     var positions=new float[data.VertexCount*3];var normals=new float[data.VertexCount*3];var uv=new float[data.VertexCount*2];
     for(int i=0;i<data.VertexCount;i++) {
      var p=Vector(data,i,0);var n=Vector(data,i,3);
      positions[i*3]=p.X;positions[i*3+1]=p.Y;positions[i*3+2]=p.Z;
      normals[i*3]=n.X;normals[i*3+1]=n.Y;normals[i*3+2]=n.Z;
      var type=data.Info.GetComponentType(6);
      if(type==VertexComponentType.Half2){var t=data.GetHalf2(i,6);uv[i*2]=(float)t.X;uv[i*2+1]=1-(float)t.Y;}
      else if(type==VertexComponentType.Float2){var t=data.GetVector2(i,6);uv[i*2]=t.X;uv[i*2+1]=1-t.Y;}
      else throw new Exception("Formato de UV não suportado: "+type);
     }
     string diffuse=null;var pars=geo.Shader.ParametersList;
     for(int pi=0;pi<pars.Parameters.Length;pi++)if(pars.Hashes[pi].ToString().Equals("DiffuseSampler",StringComparison.OrdinalIgnoreCase)){var reference=pars.Parameters[pi].Data as TextureBase;if(reference!=null)diffuse=reference.Name;}
     Texture texture;
     if(diffuse==null||(!local.TryGetValue(diffuse,out texture)&&!external.TryGetValue(diffuse,out texture)))throw new Exception("Textura difusa ausente: "+(diffuse??"material sem DiffuseSampler")+". Selecione o YTD correspondente.");
     string id;
     if(!exported.TryGetValue(texture,out id)) {
      id="texture_"+exported.Count.ToString("D3");exported.Add(texture,id);
      File.WriteAllBytes(Path.Combine(output,id+".dds"),DDSIO.GetDDSFile(texture));
      maps.Add(new {id,name=diffuse,width=texture.Width,height=texture.Height,format=texture.Format.ToString()});
     }
     meshes.Add(new {name="drawable_"+di+"_mesh_"+meshes.Count,positions,normals,uv,indices=indices.Select(v=>(int)v).ToArray(),texture=id,shader=geo.Shader.Name.ToString()});
    }
   }
   if(meshes.Count==0)throw new Exception("Nenhuma malha no LOD escolhido.");
   var json=new JavaScriptSerializer{MaxJsonLength=128*1024*1024};
   File.WriteAllText(Path.Combine(output,"decoded.json"),json.Serialize(new {meshes,textures=maps,vertices,triangles,lod,axes="GTA Z-up; unidades originais",uvConvention="OBJ V = 1 - GTA V"}),new System.Text.UTF8Encoding(false));
   return 0;
  } catch(Exception e){Console.Error.WriteLine(e.Message);return 1;}
 }
}
