/* ============================================================
   InovaMetrics Hero — Pulse Wave Point Cloud
   Wix Custom Element (Web Component)

   用法（在 Wix 里）:
   - Tag name:  inovametrics-hero
   - Server URL: 指向本文件的公开 HTTPS 地址
   - 可选属性（在 Wix Custom Element 面板的 Attributes 里设，无需改代码）:
       scan-color   波前高亮色   (默认 #d6e8ff)
       base-color   静置点颜色   (默认 #8fa0b6)
       base-bright  基础点亮度   (默认 0.2)
       wave-speed   波前速度     (默认 3.4)
   ============================================================ */
(function(){
'use strict';

const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
let threeLoading = null;
function loadThree(){
  if (window.THREE) return Promise.resolve(window.THREE);
  if (threeLoading) return threeLoading;
  threeLoading = new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = THREE_URL; s.async = true;
    s.onload = ()=>res(window.THREE);
    s.onerror = ()=>rej(new Error('THREE load failed'));
    document.head.appendChild(s);
  });
  return threeLoading;
}

class InovametricsHero extends HTMLElement {
  constructor(){
    super();
    this._raf = 0;
    this._inited = false;
  }
  static get observedAttributes(){
    return ['scan-color','base-color','base-bright','wave-speed'];
  }
  connectedCallback(){
    if (this._inited) return;
    this._inited = true;

    const shadow = this.attachShadow({mode:'open'});
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;'+
      'background:radial-gradient(120% 90% at 70% 40%, #0a1020 0%, #04060b 60%);';
    shadow.appendChild(wrap);
    // 让宿主元素铺满 Wix 容器
    this.style.cssText = 'display:block;position:relative;width:100%;height:100%;';
    this._wrap = wrap;

    loadThree().then(THREE => this._init(THREE, wrap))
               .catch(err => console.error('[inovametrics-hero]', err));
  }
  disconnectedCallback(){
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._renderer){ this._renderer.dispose && this._renderer.dispose(); }
    if (this._onResize) window.removeEventListener('resize', this._onResize);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
  }
  attributeChangedCallback(name, _o, val){
    if (!this._u) return; // 尚未初始化
    if (name==='scan-color' && val) this._u.uScanColor.value.set(val);
    if (name==='base-color' && val) this._u.uBaseColor.value.set(val);
    if (name==='base-bright' && val!=null) this._u.uBase.value = parseFloat(val);
    if (name==='wave-speed' && val!=null) this._u.uSpeed.value = parseFloat(val);
  }

  _cfg(){
    const a = (n,d)=> this.getAttribute(n) ?? d;
    return {
      waveSpeed:    parseFloat(a('wave-speed','3.4')),
      frontWidth:   0.2,
      elasticAmp:   0.07,
      springFreq:   17,
      springDamp:   3.6,
      glowDecay:    1.7,
      emitRate:     0.3,
      autoInterval: 3,
      idleAfter:    5,
      baseBright:   parseFloat(a('base-bright','0.2')),
      pointSize:    1.35,
      scanColor:    a('scan-color','#d6e8ff'),
      baseColor:    a('base-color','#8fa0b6'),
      clickAmp:     1.5,
      moveAmp:      0.85,
      heroPulse:    [0.7, 1.1, -2.8],
    };
  }

  _init(THREE, wrap){
    const CONFIG = this._cfg();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W = ()=> wrap.clientWidth  || window.innerWidth;
    const H = ()=> wrap.clientHeight || window.innerHeight;
    const isNarrow = W() < 760;
    const DENS = isNarrow ? 0.45 : 1.0;

    /* ---- 点云生成 ---- */
    const P=[], N=[], S=[];
    function g(){ return (Math.random()+Math.random()+Math.random()-1.5)/1.5; }
    function push(x,y,z,nx,ny,nz,jit){
      P.push(x+g()*jit,y+g()*jit,z+g()*jit); N.push(nx,ny,nz); S.push(Math.random()*100);
    }
    function edge(a,b,perM,n,jit=0.012){
      const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
      const len=Math.sqrt(dx*dx+dy*dy+dz*dz);
      const cnt=Math.max(2,Math.round(len*perM*DENS));
      for(let i=0;i<cnt;i++){const t=Math.random();
        push(a[0]+dx*t,a[1]+dy*t,a[2]+dz*t,n[0],n[1],n[2],jit);}
    }
    function face(o,u,v,perM2,n,jit=0.02){
      const area=Math.hypot(u[0],u[1],u[2])*Math.hypot(v[0],v[1],v[2]);
      const cnt=Math.round(area*perM2*DENS);
      for(let i=0;i<cnt;i++){const a=Math.random(),b=Math.random();
        push(o[0]+u[0]*a+v[0]*b,o[1]+u[1]*a+v[1]*b,o[2]+u[2]*a+v[2]*b,n[0],n[1],n[2],jit);}
    }
    function box(min,max,perM,jit=0.012){
      const [x0,y0,z0]=min,[x1,y1,z1]=max;
      const E=[
        [[x0,y0,z0],[x1,y0,z0],[0,1,0]],[[x0,y0,z1],[x1,y0,z1],[0,1,0]],
        [[x0,y0,z0],[x0,y0,z1],[0,1,0]],[[x1,y0,z0],[x1,y0,z1],[0,1,0]],
        [[x0,y1,z0],[x1,y1,z0],[0,1,0]],[[x0,y1,z1],[x1,y1,z1],[0,1,0]],
        [[x0,y1,z0],[x0,y1,z1],[0,1,0]],[[x1,y1,z0],[x1,y1,z1],[0,1,0]],
        [[x0,y0,z0],[x0,y1,z0],[-1,0,0]],[[x1,y0,z0],[x1,y1,z0],[1,0,0]],
        [[x0,y0,z1],[x0,y1,z1],[-1,0,0]],[[x1,y0,z1],[x1,y1,z1],[1,0,0]],
      ];
      for(const e of E) edge(e[0],e[1],perM,e[2],jit);
    }
    const EDGE=30, EDGE_SOFT=20;
    for(let x=-4;x<=4.01;x+=0.55) edge([x,0,-3],[x,0,3],7,[0,1,0],0.02);
    face([-4,0,-3],[8,0,0],[0,0,6],9,[0,1,0],0.015);
    const CY=3.0,CY2=2.84;
    for(let x=-4;x<=4.01;x+=2.0){edge([x,CY,-3],[x,CY,3],EDGE,[0,-1,0]);edge([x,CY2,-3],[x,CY2,3],EDGE_SOFT,[0,-1,0]);}
    for(let z=-3;z<=3.01;z+=1.5){edge([-4,CY,z],[4,CY,z],EDGE,[0,-1,0]);edge([-4,CY2,z],[4,CY2,z],EDGE_SOFT,[0,-1,0]);}
    for(let x=-4;x<=4.01;x+=2.0)for(let z=-3;z<=3.01;z+=1.5)edge([x,CY2,z],[x,CY,z],26,[0,-1,0]);
    face([-4,CY,-3],[8,0,0],[0,0,6],4,[0,-1,0],0.02);
    edge([-4,0,-3],[4,0,-3],EDGE_SOFT,[0,0,1]);edge([-4,3,-3],[4,3,-3],EDGE_SOFT,[0,0,1]);
    edge([-4,0,-3],[-4,3,-3],EDGE_SOFT,[1,0,0]);edge([4,0,-3],[4,3,-3],EDGE_SOFT,[-1,0,0]);
    face([-4,0,-3],[8,0,0],[0,3,0],7,[0,0,1],0.02);
    const FX=0.7;
    box([FX-0.95,0,-3],[FX+0.95,1.32,-2.72],EDGE);
    edge([FX-0.48,0.14,-2.71],[FX+0.48,0.14,-2.71],EDGE,[0,0,1]);
    edge([FX-0.48,0.78,-2.71],[FX+0.48,0.78,-2.71],EDGE,[0,0,1]);
    edge([FX-0.48,0.14,-2.71],[FX-0.48,0.78,-2.71],EDGE,[0,0,1]);
    edge([FX+0.48,0.14,-2.71],[FX+0.48,0.78,-2.71],EDGE,[0,0,1]);
    face([FX-0.95,0,-2.72],[1.9,0,0],[0,1.32,0],26,[0,0,1],0.015);
    box([FX-1.1,1.32,-3],[FX+1.1,1.48,-2.62],EDGE);
    edge([FX-0.62,1.75,-2.95],[FX+0.62,1.75,-2.95],EDGE_SOFT,[0,0,1]);
    edge([FX-0.62,2.42,-2.95],[FX+0.62,2.42,-2.95],EDGE_SOFT,[0,0,1]);
    edge([FX-0.62,1.75,-2.95],[FX-0.62,2.42,-2.95],EDGE_SOFT,[0,0,1]);
    edge([FX+0.62,1.75,-2.95],[FX+0.62,2.42,-2.95],EDGE_SOFT,[0,0,1]);
    function builtIn(x0,x1){
      const zF=-2.86;
      box([x0,0,-3],[x1,0.86,zF],EDGE_SOFT);
      edge([x0,0.86,zF],[x1,0.86,zF],EDGE,[0,0,1]);
      for(const y of [1.28,1.72,2.16,2.6]){
        edge([x0,y,zF],[x1,y,zF],EDGE,[0,0,1]);
        edge([x0,y,-3],[x0,y,zF],22,[0,0,1]); edge([x1,y,-3],[x1,y,zF],22,[0,0,1]);
      }
      edge([x0,0.86,zF],[x0,2.6,zF],EDGE_SOFT,[0,0,1]);
      edge([x1,0.86,zF],[x1,2.6,zF],EDGE_SOFT,[0,0,1]);
      for(const y of [1.28,1.72,2.16]){
        const cx=x0+0.3+Math.random()*(x1-x0-0.6);
        for(let i=0;i<26*DENS;i++) push(cx+g()*0.09,y+0.09+g()*0.07,zF+0.04+g()*0.05,0,0,1,0.01);
      }
    }
    builtIn(-3.7,-0.6); builtIn(2.0,3.75);
    edge([-4,0,-3],[-4,0,3],EDGE_SOFT,[1,0,0]);edge([-4,3,-3],[-4,3,3],EDGE_SOFT,[1,0,0]);
    face([-4,0,-3],[0,0,6],[0,3,0],5,[1,0,0],0.02);
    function rectX(y0,y1,z0,z1,perM){
      edge([-4,y0,z0],[-4,y0,z1],perM,[1,0,0]);edge([-4,y1,z0],[-4,y1,z1],perM,[1,0,0]);
      edge([-4,y0,z0],[-4,y1,z0],perM,[1,0,0]);edge([-4,y0,z1],[-4,y1,z1],perM,[1,0,0]);
    }
    rectX(0.7,2.5,-1.9,1.9,EDGE); rectX(0.78,2.42,-1.82,1.82,EDGE_SOFT);
    edge([-4,0.78,-0.65],[-4,2.42,-0.65],EDGE,[1,0,0]);
    edge([-4,0.78,0.6],[-4,2.42,0.6],EDGE,[1,0,0]);
    edge([-4,1.62,-1.82],[-4,1.62,1.82],EDGE,[1,0,0]);
    box([-0.7,0,0.9],[1.7,0.55,1.85],EDGE_SOFT,0.016);
    edge([-0.7,0.82,1.75],[1.7,0.82,1.75],EDGE,[0,1,0],0.016);
    edge([-0.7,0.55,0.9],[-0.7,0.82,1.75],20,[0,1,0],0.016);
    edge([1.7,0.55,0.9],[1.7,0.82,1.75],20,[0,1,0],0.016);
    face([-0.7,0.55,0.9],[2.4,0,0],[0,0,0.95],16,[0,1,0],0.02);
    box([-3.45,0,-1.3],[-2.5,0.55,1.0],EDGE_SOFT,0.016);
    edge([-3.45,0.82,-1.3],[-3.45,0.82,1.0],EDGE,[0,1,0],0.016);
    face([-3.45,0.55,-1.3],[0.95,0,0],[0,0,2.3],16,[0,1,0],0.02);
    function swivel(cx,cz){
      for(let ring=0;ring<4;ring++){
        const y=0.18+ring*0.17,r=0.42-ring*0.02;
        const cnt=Math.round(46*DENS);
        for(let i=0;i<cnt;i++){const a=Math.random()*Math.PI*2;
          push(cx+Math.cos(a)*r,y+g()*0.02,cz+Math.sin(a)*r,Math.cos(a),0.3,Math.sin(a),0.012);}
      }
      for(let i=0;i<40*DENS;i++){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*0.36;
        push(cx+Math.cos(a)*r,0.5+g()*0.015,cz+Math.sin(a)*r,0,1,0,0.012);}
    }
    swivel(-1.75,2.15); swivel(-0.55,2.65);
    box([-0.15,0.32,-0.15],[1.15,0.42,0.6],EDGE_SOFT,0.012);
    face([-0.15,0.42,-0.15],[1.3,0,0],[0,0,0.75],30,[0,1,0],0.012);
    edge([-2.6,0.01,-0.8],[1.9,0.01,-0.8],10,[0,1,0],0.02);
    edge([-2.6,0.01,2.6],[1.9,0.01,2.6],10,[0,1,0],0.02);
    edge([-2.6,0.01,-0.8],[-2.6,0.01,2.6],10,[0,1,0],0.02);
    edge([1.9,0.01,-0.8],[1.9,0.01,2.6],10,[0,1,0],0.02);
    const dustCnt=Math.round(900*DENS);
    for(let i=0;i<dustCnt;i++) push(-4+Math.random()*8,Math.random()*3,-3+Math.random()*6,0,1,0,0);

    const COUNT=P.length/3;
    const posArr=new Float32Array(P);

    /* ---- 场景 ---- */
    const renderer=new THREE.WebGLRenderer({antialias:false,alpha:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
    renderer.setSize(W(),H());
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.cssText='display:block;width:100%;height:100%;';
    this._renderer = renderer;

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(44,W()/H(),0.1,60);
    const CAM_BASE=new THREE.Vector3(1.35,1.72,7.6);
    const LOOK=new THREE.Vector3(-1.35,1.35,-0.4);
    camera.position.copy(CAM_BASE); camera.lookAt(LOOK);

    const MAXP=10;
    const pulsePos=[]; const pulseT=new Array(MAXP).fill(-99); const pulseAmp=new Array(MAXP).fill(0);
    for(let i=0;i<MAXP;i++) pulsePos.push(new THREE.Vector3(0,-99,0));
    let pulseHead=0;

    const uniforms={
      uTime:{value:0}, uPulsePos:{value:pulsePos}, uPulseT:{value:pulseT}, uPulseAmp:{value:pulseAmp},
      uSpeed:{value:CONFIG.waveSpeed}, uFrontW:{value:CONFIG.frontWidth},
      uElastic:{value:reduceMotion?0:CONFIG.elasticAmp}, uFreq:{value:CONFIG.springFreq},
      uZeta:{value:CONFIG.springDamp}, uGlowDecay:{value:CONFIG.glowDecay},
      uSize:{value:CONFIG.pointSize}, uBase:{value:reduceMotion?Math.max(CONFIG.baseBright,0.3):CONFIG.baseBright},
      uFade:{value:1.0}, uScanColor:{value:new THREE.Color(CONFIG.scanColor)},
      uBaseColor:{value:new THREE.Color(CONFIG.baseColor)}, uJitter:{value:reduceMotion?0:1.0},
    };
    this._u = uniforms;

    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(posArr,3));
    geo.setAttribute('aNormal',new THREE.BufferAttribute(new Float32Array(N),3));
    geo.setAttribute('aSeed',new THREE.BufferAttribute(new Float32Array(S),1));

    const mat=new THREE.ShaderMaterial({
      uniforms, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
      vertexShader:`
        #define MAXP ${MAXP}
        attribute vec3 aNormal; attribute float aSeed;
        uniform vec3 uPulsePos[MAXP]; uniform float uPulseT[MAXP]; uniform float uPulseAmp[MAXP];
        uniform float uTime,uSpeed,uFrontW,uElastic,uFreq,uZeta,uGlowDecay,uSize,uJitter;
        varying float vFront; varying float vGlow; varying float vNdcX; varying float vSeed;
        void main(){
          vec3 p=position; float front=0.0; float glow=0.0; vec3 disp=vec3(0.0);
          for(int k=0;k<MAXP;k++){
            float age=uTime-uPulseT[k];
            if(age<0.0||age>6.0) continue;
            float amp=uPulseAmp[k];
            float d=distance(position,uPulsePos[k]);
            float att=amp/(1.0+d*0.22);
            float R=age*uSpeed; float x=d-R;
            front+=exp(-x*x/(uFrontW*uFrontW))*att;
            float tau=age-d/uSpeed;
            if(tau>0.0){
              glow+=exp(-tau/uGlowDecay)*0.6*att;
              disp+=aNormal*uElastic*att*sin(tau*uFreq)*exp(-tau*uZeta);
            }
          }
          vFront=min(front,1.6); vGlow=min(glow,1.0); vSeed=aSeed;
          p+=aNormal*sin(uTime*1.25+aSeed*17.0)*0.0045*uJitter;
          p+=disp;
          vec4 mv=modelViewMatrix*vec4(p,1.0);
          gl_Position=projectionMatrix*mv;
          vNdcX=gl_Position.x/gl_Position.w;
          float i=clamp(vFront+vGlow,0.0,1.0);
          gl_PointSize=uSize*(1.0+i*1.9)*(30.0/-mv.z);
        }
      `,
      fragmentShader:`
        uniform vec3 uScanColor,uBaseColor; uniform float uBase,uFade;
        varying float vFront,vGlow,vNdcX,vSeed;
        void main(){
          vec2 c=gl_PointCoord-0.5; float dd=length(c);
          if(dd>0.5) discard;
          float soft=smoothstep(0.5,0.08,dd);
          float fade=mix(1.0,mix(0.14,1.0,smoothstep(-0.92,-0.08,vNdcX)),uFade);
          float i=clamp(vFront+vGlow,0.0,1.0);
          vec3 col=mix(uBaseColor,uScanColor,i);
          col+=vec3(0.9,0.95,1.0)*clamp(vFront-0.55,0.0,1.0)*0.8;
          col+=vec3(0.05,0.02,-0.02)*step(0.82,fract(vSeed*0.371));
          float alpha=(uBase+(1.0-uBase)*i)*soft*fade;
          gl_FragColor=vec4(col,alpha);
        }
      `,
    });
    scene.add(new THREE.Points(geo,mat));

    /* ---- 交互 ---- */
    const clock=new THREE.Clock();
    const raycaster=new THREE.Raycaster();
    const mouseNdc=new THREE.Vector2(10,10);
    let lastPointerMove=-999,lastEmit=-999,pointerDirty=false,lastAuto=-999;
    const _v=new THREE.Vector3();
    function nearestSurfacePoint(){
      raycaster.setFromCamera(mouseNdc,camera);
      const ro=raycaster.ray.origin,rd=raycaster.ray.direction;
      let best=-1,bestD=0.3025,bestT=0;
      for(let i=0;i<COUNT;i+=6){
        const px=posArr[i*3]-ro.x,py=posArr[i*3+1]-ro.y,pz=posArr[i*3+2]-ro.z;
        const t=px*rd.x+py*rd.y+pz*rd.z;
        if(t<0) continue;
        const cx=px-rd.x*t,cy=py-rd.y*t,cz=pz-rd.z*t;
        const d2=cx*cx+cy*cy+cz*cz;
        if(d2<bestD&&(best<0||t<bestT+0.6)){best=i;bestD=d2;bestT=t;}
      }
      if(best<0) return null;
      return _v.set(posArr[best*3],posArr[best*3+1],posArr[best*3+2]).clone();
    }
    function emitPulse(o,amp,now){pulsePos[pulseHead].copy(o);pulseT[pulseHead]=now;pulseAmp[pulseHead]=amp;pulseHead=(pulseHead+1)%MAXP;}
    function emitFromPointer(amp){const now=clock.elapsedTime;const o=nearestSurfacePoint();if(o)emitPulse(o,amp,now);lastEmit=now;}

    const rectOf = ()=> renderer.domElement.getBoundingClientRect();
    const setNdc = (cx,cy)=>{
      const r=rectOf();
      mouseNdc.x=((cx-r.left)/r.width)*2-1;
      mouseNdc.y=-((cy-r.top)/r.height)*2+1;
      lastPointerMove=clock.elapsedTime;
    };
    this.addEventListener('pointermove',e=>{setNdc(e.clientX,e.clientY);pointerDirty=true;},{passive:true});
    this.addEventListener('pointerdown',e=>{setNdc(e.clientX,e.clientY);emitFromPointer(CONFIG.clickAmp);},{passive:true});
    this.addEventListener('touchmove',e=>{if(e.touches.length){setNdc(e.touches[0].clientX,e.touches[0].clientY);pointerDirty=true;}},{passive:true});

    setTimeout(()=>{emitPulse(new THREE.Vector3(CONFIG.heroPulse[0],CONFIG.heroPulse[1],CONFIG.heroPulse[2]),1.4,clock.elapsedTime);},350);

    const camTarget=new THREE.Vector3().copy(CAM_BASE);
    const self=this;
    let running=true;
    this._onVis=()=>{running=!document.hidden;if(running){clock.getDelta();loop();}};
    document.addEventListener('visibilitychange',this._onVis);
    function loop(){
      if(!running) return;
      self._raf=requestAnimationFrame(loop);
      const now=clock.getElapsedTime();
      uniforms.uTime.value=now;
      if(!reduceMotion){
        const idle=now-lastPointerMove>CONFIG.idleAfter;
        if(!idle&&pointerDirty&&now-lastEmit>CONFIG.emitRate){emitFromPointer(CONFIG.moveAmp);pointerDirty=false;}
        if(idle&&now-lastAuto>CONFIG.autoInterval){
          const i=(Math.random()*COUNT)|0;
          emitPulse(_v.set(posArr[i*3],posArr[i*3+1],posArr[i*3+2]).clone(),0.9,now);
          lastAuto=now;
        }
        if(!idle) lastAuto=now-CONFIG.autoInterval*0.4;
        camTarget.x=CAM_BASE.x+(mouseNdc.x<5?mouseNdc.x:0)*0.28+Math.sin(now*0.11)*0.07;
        camTarget.y=CAM_BASE.y-(mouseNdc.y<5?mouseNdc.y:0)*0.14+Math.sin(now*0.07)*0.04;
        camera.position.lerp(camTarget,0.045);
        camera.lookAt(LOOK);
      }
      renderer.render(scene,camera);
    }
    loop();

    this._onResize=()=>{
      const w=W(),h=H();
      camera.aspect=w/h; camera.updateProjectionMatrix();
      renderer.setSize(w,h);
    };
    window.addEventListener('resize',this._onResize);
    // 容器尺寸变化（Wix section 高度可能非视口）也要响应
    if(window.ResizeObserver){
      this._ro=new ResizeObserver(this._onResize);
      this._ro.observe(wrap);
    }
  }
}

if (!customElements.get('inovametrics-hero')) {
  customElements.define('inovametrics-hero', InovametricsHero);
}
})();
