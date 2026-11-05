"""Read-only comparison of private vehicle copies, partitioned by material."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import shutil
import sys

import addon_utils
import bpy
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--config', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(args.output)
root.mkdir(parents=True, exist_ok=False)
addon_utils.enable('bl_ext.repo_sollumz_org.sollumz', default_set=False)
results = []
for source in json.loads(Path(args.config).read_text(encoding='utf-8-sig')):
    original = Path(source['file'])
    work = root / source['label']
    work.mkdir()
    files = []
    for name in [original.name, original.stem + '_hi.yft', original.stem + '.ytd']:
        file = original.parent / name
        if not file.exists(): continue
        shutil.copyfile(file, work / name)
        files.append({'file': name, 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
    for collection in [bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures]:
        for item in list(collection): collection.remove(item, do_unlink=True)
    bpy.ops.sollumz.import_assets(directory=str(work), files=[{'name': original.name}], use_custom_settings=True, import_as_asset=False)
    arm = next(o for o in bpy.data.objects if o.sollum_type == 'sollumz_fragment')
    profiles = {}
    for mat in bpy.data.materials:
        if mat.sollum_type != 'sollumz_material_shader' or not mat.node_tree: continue
        params, samplers = {}, {}
        for node in mat.node_tree.nodes:
            if node.type == 'TEX_IMAGE':
                image = node.image
                samplers[node.name] = {'image': image.name if image else None, 'file': image.filepath if image else None,
                    'packed': bool(image and image.packed_file), 'size': list(image.size) if image else None,
                    'colorspace': image.colorspace_settings.name if image else None, 'embedded': node.texture_properties.embedded}
            elif hasattr(node, 'get_float'): params[node.name] = [node.get(i) for i in range(len(node.outputs))]
        profiles[mat.name] = {'shader': mat.shader_properties.filename, 'bucket': str(mat.shader_properties.renderbucket),
            'parameters': params, 'samplers': samplers, 'colorSamples': {}, 'triangles': 0}
    lods = Counter()
    parts = []
    for obj in arm.children_recursive:
        if obj.type != 'MESH' or obj.sollum_type != 'sollumz_drawable_model': continue
        row = {'object': obj.name, 'constraints': [{'type': c.type, 'bone': getattr(c, 'subtarget', '')} for c in obj.constraints], 'lods': {}}
        for level in ['very_high', 'high', 'medium', 'low', 'very_low']:
            mesh = getattr(obj.sz_lods, level).mesh
            if not mesh: continue
            mesh.calc_loop_triangles()
            count = len(mesh.loop_triangles)
            lods[level] += count
            row['lods'][level] = {'triangles': count, 'uvLayers': [u.name for u in mesh.uv_layers], 'customNormals': mesh.has_custom_normals}
            if level != 'very_high': continue
            # Sample each material's own loops; never aggregate a whole mesh's
            # light IDs or glass alpha into unrelated material profiles.
            by_material = {}
            for poly in mesh.polygons: by_material.setdefault(poly.material_index, []).extend(poly.loop_indices)
            for index, loops in by_material.items():
                mat = mesh.materials[index]
                if not mat or mat.name not in profiles: continue
                profile = profiles[mat.name]
                profile['triangles'] += sum(1 for tri in mesh.loop_triangles if tri.material_index == index)
                for attr in mesh.color_attributes:
                    if attr.domain != 'CORNER': continue
                    samples = loops[::max(1, len(loops) // 1024)]
                    counts = Counter(tuple(round(x * 255) for x in attr.data[i].color_srgb) for i in samples)
                    old = Counter({tuple(item['rgba']): item['samples'] for item in profile['colorSamples'].get(attr.name, [])})
                    old.update(counts)
                    profile['colorSamples'][attr.name] = [{'rgba': list(rgba), 'samples': n} for rgba, n in old.most_common(24)]
                values = np.empty(len(mesh.corner_normals) * 3, dtype=np.float32)
                mesh.corner_normals.foreach_get('vector', values)
                lengths = np.linalg.norm(values.reshape(-1, 3)[loops], axis=1)
                profile['normalLengths'] = {'min': float(lengths.min()), 'max': float(lengths.max()), 'nonfinite': int((~np.isfinite(lengths)).sum())}
        parts.append(row)
    result = {'label': source['label'], 'source': str(original), 'files': files, 'bones': [{'name': b.name, 'parent': b.parent.name if b.parent else None, 'physics': b.sollumz_use_physics} for b in arm.data.bones],
        'lodTriangles': dict(lods), 'parts': parts, 'materials': profiles}
    (work / 'analysis.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    results.append(result)
    print('RPFORGE_REFERENCE_ANALYZED', source['label'], json.dumps({'bones': len(arm.data.bones), 'materials': len(profiles), 'lodTriangles': dict(lods)}), flush=True)
(root / 'comparison.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
