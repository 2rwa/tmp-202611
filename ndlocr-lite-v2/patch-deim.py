"""Diagnose the DEIM integral MatMul and make an algebraically equivalent patch.
Only K-vector or K-by-1 RHS is supported. Fail closed otherwise.
Original weights: NDL NDLOCR-Lite v2 (CC BY 4.0).
"""
import hashlib, json, pathlib, urllib.request
import numpy as np
import onnx
from onnx import helper, numpy_helper, TensorProto
import onnxruntime as ort

root=pathlib.Path(__file__).resolve().parent
url="https://raw.githubusercontent.com/ndl-lab/ndlocr-lite/1f3adc7af311af1ce4cbbd4d9089f30781d01313/src/model/deim-s-1024x1024-261124.onnx"
sha="f9a41c8453dd687f370bee199fd6d47ecf583cc14f1d839a0b416db39b356e8c"
old=root/"det-original.onnx"
new=root/"det-patched.onnx"
if not old.exists(): urllib.request.urlretrieve(url,old)
assert hashlib.sha256(old.read_bytes()).hexdigest()==sha
m=onnx.load(old)
try: inferred=onnx.shape_inference.infer_shapes(m)
except Exception as exc:
    print("Shape inference warning:",exc,flush=True)
    inferred=m
shapes={}
for v in list(inferred.graph.value_info)+list(inferred.graph.input)+list(inferred.graph.output):
    if v.type.tensor_type.HasField("shape"):
        shapes[v.name]=[d.dim_value if d.HasField("dim_value") else d.dim_param or None for d in v.type.tensor_type.shape.dim]
for t in m.graph.initializer: shapes[t.name]=list(t.dims)
for n in m.graph.node:
    if n.op_type=="Constant":
        for a in n.attribute:
            if a.name=="value" and a.type==onnx.AttributeProto.TENSOR: shapes[n.output[0]]=list(a.t.dims)
targets=[n for n in m.graph.node if n.op_type=="MatMul" and "/integral/" in n.name]
print("Integral MatMul targets:",[(n.name,[(x,shapes.get(x)) for x in n.input],[(x,shapes.get(x)) for x in n.output]) for n in targets],flush=True)
assert len(targets)==1,"Unexpected integral MatMul count"
n=targets[0]
a,b=n.input
bs=shapes.get(b)
assert bs and (len(bs)==1 or (len(bs)==2 and bs[1]==1)),f"Unsupported RHS: {bs}; inspect printed shapes before further patch"
assert isinstance(bs[0],int) and bs[0]>0
ashape=shapes.get(a)
if ashape and isinstance(ashape[-1],int): assert ashape[-1]==bs[0],(ashape,bs)
opset=next(i.version for i in m.opset_import if i.domain in ("","ai.onnx"))
assert opset>=13,opset
prefix="gpu_integral_"
axis=prefix+"axis";m.graph.initializer.append(numpy_helper.from_array(np.array([-1],dtype=np.int64),axis))
mul=prefix+"mul";vec=b;nodes=[]
if len(bs)==2:
    vec=prefix+"vector"
    nodes.append(helper.make_node("Squeeze",[b,axis],[vec],name=prefix+"squeeze"))
nodes.append(helper.make_node("Mul",[a,vec],[mul],name=prefix+"mul"))
nodes.append(helper.make_node("ReduceSum",[mul,axis],list(n.output),keepdims=int(len(bs)==2),name=prefix+"reduce"))
idx=next(i for i,node in enumerate(m.graph.node) if node.name==n.name)
del m.graph.node[idx]
for i,node in enumerate(nodes): m.graph.node.insert(idx+i,node)
onnx.checker.check_model(m);onnx.save(m,new)
# Compare actual full-model outputs on two deterministic input images.
# Detection scores, coords and count classes must remain equivalent.
opts=ort.SessionOptions();opts.intra_op_num_threads=2
s0=ort.InferenceSession(str(old),sess_options=opts,providers=["CPUExecutionProvider"])
s1=ort.InferenceSession(str(new),sess_options=opts,providers=["CPUExecutionProvider"])
ins=s0.get_inputs(); names=[x.name for x in ins]; print("CPU input specs",[(x.name,x.shape,x.type) for x in ins],flush=True)
shape=ins[0].shape
shape=[1 if not isinstance(x,int) else x for x in shape]
assert len(shape)==4 and shape[1]==3
rng=np.random.default_rng(17)
for name,x in [("zeros",np.zeros(shape,np.float32)),("random",rng.normal(0,.4,shape).astype(np.float32))]:
    feed={names[0]:x,names[1]:np.array([[shape[2],shape[3]]],dtype=np.int64)}
    p,q=s0.run(None,feed),s1.run(None,feed)
    for spec,v,w in zip(s0.get_outputs(),p,q):
        assert v.shape==w.shape,(spec.name,v.shape,w.shape)
        if np.issubdtype(v.dtype,np.floating):
            err=float(np.max(np.abs(v-w))) if v.size else 0.
            print(name,spec.name,"max abs diff",err,flush=True)
            np.testing.assert_allclose(v,w,rtol=1e-3,atol=1e-2)
        else: np.testing.assert_array_equal(v,w)
(root/"det-patch.json").write_text(json.dumps({"sha256":hashlib.sha256(new.read_bytes()).hexdigest(),"sourceSha256":sha,"target":"/integral/MatMul","cpuParity":True},indent=2))
print("Patched model validated against original CPU outputs",flush=True)
