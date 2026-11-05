"""Read shader parameters and vertex colors from a private copy of a reference addon."""
import argparse
import json
import sys
import shutil
from collections import Counter, defaultdict
from pathlib import Path
import addon_utils
import bpy

parser = argparse.ArgumentParser()
parser.add_argument('--reference', required=True); parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
reference = Path(args.reference); output = Path(args.output); output.mkdir(parents=True, exist_ok=False)
for name in [reference.name, reference.stem + '_hi.yft', reference.stem + '.ytd']:
    source = reference.parent / name
    if source.is_file(): shutil.copyfile(source, output / name)
addon_utils.enable('bl_ext.repo_sollumz_org.sollumz', default_set=False)
for obj in list(bpy.data.objects): bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.sollumz.import_assets(directory=str(output), files=[{'name': reference.name}], use_custom_settings=True, import_as_asset=False)
profiles = []
for material in bpy.data.materials:
    if material.sollum_type != 'sollumz_material_shader' or not material.node_tree: continue
    parameters = {}; textures = {}
    for node in material.node_tree.nodes:
        if node.type == 'TEX_IMAGE': textures[node.name] = {'image': node.image.name if node.image else None, 'embedded': node.texture_properties.embedded}
        elif hasattr(node, 'get_float'):
            parameters[node.name] = [node.get(i) for i in range(len(node.outputs))]
    profiles.append({'material': material.name, 'shader': material.shader_properties.filename, 'parameters': parameters, 'samplers': textures})
colors = defaultdict(lambda: defaultdict(Counter)); mesh_counts = Counter()
for obj in bpy.data.objects:
    if obj.type != 'MESH' or obj.sollum_type != 'sollumz_drawable_model': continue
    mesh = obj.data
    shaders = {m.shader_properties.filename for m in mesh.materials if m and m.sollum_type == 'sollumz_material_shader'}
    for shader in shaders:
        mesh_counts[shader] += 1
        for attr in mesh.color_attributes:
            if not len(attr.data): continue
            for i in range(0, len(attr.data), max(1, len(attr.data) // 512)):
                rgba = tuple(round(v * 255) for v in attr.data[i].color_srgb)
                colors[shader][attr.name][rgba] += 1
result = {'source': str(reference), 'bones': [len(obj.data.bones) for obj in bpy.data.objects if obj.type == 'ARMATURE'],
          'profiles': profiles, 'shaderMeshCounts': dict(mesh_counts),
          'vertexColors': {shader: {name: [{'rgba': list(rgba), 'samples': n} for rgba, n in samples.most_common(12)] for name, samples in attrs.items()} for shader, attrs in colors.items()}}
(output / 'material-reference.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
if not profiles: raise RuntimeError('A referência não forneceu shaders legíveis.')
bpy.ops.wm.save_as_mainfile(filepath=str(output / 'reference.blend'), relative_remap=False)
print('RPFORGE_REFERENCE_READY', json.dumps({'shaders': list(mesh_counts), 'materials': len(profiles), 'bones': result['bones']}), flush=True)
