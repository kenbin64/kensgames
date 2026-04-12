/**
 * 🔍 VR DIAGNOSTIC TOOL
 * ====================
 * Run this in browser console to diagnose VR issues
 * 
 * Usage:
 *   1. Open browser console (F12)
 *   2. Paste this entire file
 *   3. Type: runVRDiagnostic()
 */

function runVRDiagnostic() {
    console.log('🔍 VR DIAGNOSTIC TOOL');
    console.log('='.repeat(60));
    console.log('');
    
    const results = {
        passed: [],
        failed: [],
        warnings: []
    };
    
    // Test 1: WebXR Support
    console.log('📋 Test 1: WebXR Support');
    if ('xr' in navigator) {
        results.passed.push('✅ navigator.xr exists');
        
        navigator.xr.isSessionSupported('immersive-vr').then(supported => {
            if (supported) {
                results.passed.push('✅ immersive-vr supported');
                console.log('  ✅ WebXR VR is supported');
            } else {
                results.failed.push('❌ immersive-vr NOT supported');
                console.log('  ❌ WebXR VR is NOT supported');
                console.log('     → Use Meta Quest Browser');
            }
        });
    } else {
        results.failed.push('❌ navigator.xr does NOT exist');
        console.log('  ❌ WebXR not available');
        console.log('     → Use Meta Quest Browser or Chrome/Edge with WebXR flag');
    }
    console.log('');
    
    // Test 2: HTTPS
    console.log('📋 Test 2: HTTPS Protocol');
    if (window.location.protocol === 'https:') {
        results.passed.push('✅ Using HTTPS');
        console.log('  ✅ HTTPS enabled');
    } else {
        results.failed.push('❌ Using HTTP (WebXR requires HTTPS)');
        console.log('  ❌ Using HTTP - WebXR requires HTTPS!');
        console.log('     → Use ngrok or deploy with SSL');
    }
    console.log('');
    
    // Test 3: Three.js
    console.log('📋 Test 3: Three.js');
    if (typeof THREE !== 'undefined') {
        results.passed.push('✅ Three.js loaded');
        console.log('  ✅ Three.js loaded');
        console.log('     Version:', THREE.REVISION);
        
        if (parseInt(THREE.REVISION) >= 128) {
            results.passed.push('✅ Three.js version >= r128');
            console.log('     ✅ Version supports WebXR');
        } else {
            results.failed.push('❌ Three.js version < r128');
            console.log('     ❌ Version too old for WebXR');
            console.log('        → Update to r128 or newer');
        }
    } else {
        results.failed.push('❌ Three.js NOT loaded');
        console.log('  ❌ Three.js not loaded');
    }
    console.log('');
    
    // Test 4: Scene
    console.log('📋 Test 4: Scene');
    if (typeof scene !== 'undefined' && scene) {
        results.passed.push('✅ Scene exists');
        console.log('  ✅ Scene exists');
        console.log('     Children:', scene.children.length);
        console.log('     Background:', scene.background);
        
        if (scene.children.length > 0) {
            results.passed.push('✅ Scene has objects');
            console.log('     ✅ Scene has objects');
        } else {
            results.warnings.push('⚠️  Scene is empty');
            console.log('     ⚠️  Scene is empty');
        }
    } else {
        results.failed.push('❌ Scene does NOT exist');
        console.log('  ❌ Scene not found');
    }
    console.log('');
    
    // Test 5: Camera
    console.log('📋 Test 5: Camera');
    if (typeof camera !== 'undefined' && camera) {
        results.passed.push('✅ Camera exists');
        console.log('  ✅ Camera exists');
        console.log('     Position:', camera.position);
        console.log('     FOV:', camera.fov);
        
        if (camera.position.length() > 0) {
            results.passed.push('✅ Camera positioned');
            console.log('     ✅ Camera is positioned');
        } else {
            results.warnings.push('⚠️  Camera at origin (0,0,0)');
            console.log('     ⚠️  Camera at origin - might be inside objects');
        }
    } else {
        results.failed.push('❌ Camera does NOT exist');
        console.log('  ❌ Camera not found');
    }
    console.log('');
    
    // Test 6: Renderer
    console.log('📋 Test 6: Renderer');
    if (typeof renderer !== 'undefined' && renderer) {
        results.passed.push('✅ Renderer exists');
        console.log('  ✅ Renderer exists');
        console.log('     XR enabled:', renderer.xr.enabled);
        
        const size = renderer.getSize(new THREE.Vector2());
        console.log('     Size:', size.x, 'x', size.y);
        
        if (renderer.xr && renderer.xr.enabled) {
            results.passed.push('✅ Renderer XR enabled');
            console.log('     ✅ XR is enabled');
        } else {
            results.failed.push('❌ Renderer XR NOT enabled');
            console.log('     ❌ XR is NOT enabled');
            console.log('        → Run: renderer.xr.enabled = true');
        }
    } else {
        results.failed.push('❌ Renderer does NOT exist');
        console.log('  ❌ Renderer not found');
    }
    console.log('');
    
    // Test 7: Lighting
    console.log('📋 Test 7: Lighting');
    if (typeof scene !== 'undefined' && scene) {
        const lights = scene.children.filter(c => c.isLight);
        console.log('  Lights found:', lights.length);
        
        if (lights.length > 0) {
            results.passed.push('✅ Scene has lighting');
            lights.forEach(light => {
                console.log('    -', light.type, 'intensity:', light.intensity);
            });
        } else {
            results.warnings.push('⚠️  No lights in scene');
            console.log('  ⚠️  No lights - scene will be dark');
        }
    }
    console.log('');
    
    // Test 8: Board
    console.log('📋 Test 8: Game Board');
    if (typeof boardGroup !== 'undefined' && boardGroup) {
        results.passed.push('✅ Board group exists');
        console.log('  ✅ Board group exists');
        console.log('     Children:', boardGroup.children.length);
        
        if (boardGroup.children.length > 0) {
            results.passed.push('✅ Board has objects');
            console.log('     ✅ Board has objects');
        } else {
            results.warnings.push('⚠️  Board is empty');
            console.log('     ⚠️  Board is empty');
        }
    } else {
        results.warnings.push('⚠️  Board group not found');
        console.log('  ⚠️  Board group not found');
    }
    console.log('');
    
    // Summary
    console.log('='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ Passed:', results.passed.length);
    results.passed.forEach(p => console.log('  ', p));
    console.log('');
    
    if (results.warnings.length > 0) {
        console.log('⚠️  Warnings:', results.warnings.length);
        results.warnings.forEach(w => console.log('  ', w));
        console.log('');
    }
    
    if (results.failed.length > 0) {
        console.log('❌ Failed:', results.failed.length);
        results.failed.forEach(f => console.log('  ', f));
        console.log('');
        console.log('🔧 VR WILL NOT WORK - Fix failed tests above');
    } else {
        console.log('🎉 ALL CRITICAL TESTS PASSED!');
        console.log('');
        console.log('VR should work. If you still see void:');
        console.log('  1. Refresh the page');
        console.log('  2. Try entering VR again');
        console.log('  3. Check VR_TROUBLESHOOTING.md');
    }
    console.log('');
    console.log('='.repeat(60));
}

// Auto-run if loaded via script tag
if (typeof window !== 'undefined') {
    window.runVRDiagnostic = runVRDiagnostic;
    console.log('🔍 VR Diagnostic loaded. Run: runVRDiagnostic()');
}

