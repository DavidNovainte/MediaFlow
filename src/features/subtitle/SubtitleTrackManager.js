/**
 * SubtitleTrackManager
 * 闂傚倷娴囧畷鍨叏閻㈢绀夋俊銈呮噹缁愭鏌￠崶銉ョ仾闁稿孩顨嗘穱濠囧Χ閸涱厽娈舵繛鎴炴尭缁夊綊寮婚妸銉㈡婵☆垯璀︽禒楣冩⒑缁嬪尅鍔熼柛瀣ㄥ€濋獮鍐ㄎ旈埀顒勫煡婢跺ň鏋庢俊顖濆吹閺嗐儳绱撻崒娆掑厡濠电偐鍋撻梺琛″亾闁告鍎愰悞鑺ャ亜韫囨挾澧曢幆鐔兼⒑鐎圭姰鈧偓闁稿鎸搁…璺ㄦ喆閸曨剛顦伴梺鍝勬湰濞茬喎鐣烽柆宥呭嵆闁绘瑢鍋撴俊宸枛椤啴濡堕崱妯碱槹婵炲瓨绮忓▔娑㈡偩瀹勬嫈鏃堝川椤撳洢鍔戦弻鏇㈠醇濠靛洤绐涢梺瑙勫絻閻忔繈鍩為幋锔藉€烽悗娑櫭喊宥夋倵濞堝灝鏋涢柣鏍с偢楠炲啴鏁嶉崟銊ヤ壕闁挎繂楠告禍婵嗏攽椤旂晫鐭掗柡灞炬礃缁绘盯鎮欓浣哄絻濠电姰鍨奸～澶娒洪悢鐓庤摕婵炴垯鍨圭粻鎶芥煙閸喖鏆為柣锝勭矙濮?
 */
class SubtitleTrackManager {
    constructor(subtitleFlow) {
        this.flow = subtitleFlow;
        this.tracks = [];
        this.activeTrackId = null;
        this.elements = {};
    }

    init() {
        this.cacheElements();
        this.addDefaultTrack();

        window.addEventListener('languageChanged', () => {
            if (this.tracks.length > 0) {
                const mainTrack = this.tracks.find(t => t.type === 'main');
                if (mainTrack) {
                    // 闂傚倸鍊烽懗鍫曗€﹂崼銏″床闁割偁鍎辩粈澶屸偓鍏夊亾闁告洦鍓欓崜顓烆渻閵堝棗绗掗悗姘煎墰缁牓宕橀埡鍐啎闂佺硶鍓濋〃鍡欑矉鐎ｎ喗鐓曢柕鍫濇搐鏍￠梺閫涚┒閸旀垿寮幇鏉垮耿婵妫欓ˉ娑氱磽閸屾瑦绁板鏉戞憸閹广垽宕熼姘辩枀闂佸湱铏庨崰妤呭疾閺屻儲鐓曟繛鎴濆船楠炴鏌?"Main track" vs "Main Track" 缂傚倸鍊搁崐鐑芥倿閿斿墽鐭欓柟娆¤娲、娑㈡倷閸欏偊绠撻弻娑㈠Ψ閵忊剝鐝掗梺缁樺笒閿曨亪鎮￠锕€鐐婇柕濠忕畱绾板秹姊洪崫鍕櫤闁诡喖鍊垮濠氬焺閸愨晛顎撻梺鍛婄缚閸庢娊顢欐径鎰拺闁告稑锕ラ悡銉╂煙閾忣個顏堬綖韫囨梻绡€婵ê鍚嬮弲顏堟⒑闁偛鑻晶鎾煏?
                    const defaultNames = [
                        'main track', 'track 1', 'piste principale', 'hauptspur', 'pista principal'
                    ];
                    const currentNameLower = mainTrack.name.toLowerCase();
                    const isDefaultName = defaultNames.some(dn => currentNameLower === dn.toLowerCase()) || 
                                        currentNameLower.startsWith('track ') ||
                                        currentNameLower.startsWith('piste ');

                    if (isDefaultName) {
                        mainTrack.name = window.i18n.t('subtitle.messages.mainTrack');
                    }
                }
                this.renderTracks();
                // 闂傚倸鍊风粈渚€骞夐敓鐘冲殞濡わ絽鍟€氬銇勯幒鎴濐伌闁轰礁妫濋弻锝夊箛椤掍焦鍎撶紓浣插亾闁糕剝绋掗埛鎴︽煕椤垵娅橀柛搴㈠姍閺岋綁骞橀姘闂傚倸鍊风粈渚€骞栭锕€鐤い鎰堕檮閸嬪鏌ｉ幘鍐差唫婵炴垯鍨圭粻浼村箹濞ｎ剙鐏╂い顐磿缁辨帡鎮欓鈧崝銈嗐亜閹存繃鍣界紒杈ㄦ崌楠炴绱掑Ο閿嬪婵＄偑鍊栫敮濠囨倿閿斿彞鐒婃い鎾卞灪閻?
                if (this.flow.timeline) {
                    this.flow.timeline.render();
                }
            }
        });
    }

    cacheElements() {
        this.elements = {
            tracksList: document.getElementById('tracks-list'),
            editorPanel: document.getElementById('subtitle-editor-panel')
        };
        this.bindTrackListEvents();
    }

    closest(target, selector) {
        if (typeof target?.closest === 'function') return target.closest(selector);
        return target?.parentElement?.closest?.(selector) || null;
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    escapeAttribute(value) {
        return this.escapeHtml(value);
    }

    coerceDataId(value) {
        if (/^-?\d+$/.test(String(value ?? ''))) {
            return Number(value);
        }
        return value;
    }

    bindTrackListEvents() {
        const { tracksList } = this.elements;
        if (!tracksList || tracksList._subtitleTrackEventsBound) return;

        tracksList.addEventListener('click', (event) => {
            const dropdown = tracksList.querySelector('.track-dropdown');
            const toggle = this.closest(event.target, '[data-track-action="toggle-menu"]');
            if (toggle && tracksList.contains(toggle)) {
                event.preventDefault();
                event.stopPropagation();
                const open = dropdown?.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                const menu = dropdown?.querySelector('.track-dropdown-menu');
                if (menu) {
                    if (open) menu.removeAttribute('hidden');
                    else menu.setAttribute('hidden', '');
                }
                return;
            }

            const option = this.closest(event.target, '[data-track-action="select"]');
            if (option && tracksList.contains(option)) {
                event.preventDefault();
                event.stopPropagation();
                dropdown?.classList.remove('is-open');
                dropdown?.querySelector('[data-track-action="toggle-menu"]')
                    ?.setAttribute('aria-expanded', 'false');
                dropdown?.querySelector('.track-dropdown-menu')?.setAttribute('hidden', '');
                this.setActiveTrack(this.coerceDataId(option.dataset.id));
                return;
            }

            const actionTarget = this.closest(event.target, '[data-track-action]');
            if (!actionTarget || !tracksList.contains(actionTarget)) return;

            const trackId = this.coerceDataId(
                actionTarget.dataset.id
                || document.querySelector('#subtitle-track-select-btn')?.dataset?.id
            );

            event.preventDefault();
            event.stopPropagation();

            if (actionTarget.dataset.trackAction === 'toggle-visibility') {
                this.toggleVisibility(trackId);
            } else if (actionTarget.dataset.trackAction === 'remove') {
                this.removeTrack(trackId);
            }
        });

        // Close menu on outside click
        if (!this._trackDropdownDocBound) {
            document.addEventListener('click', (e) => {
                const dd = document.querySelector('#tracks-list .track-dropdown');
                if (!dd?.classList.contains('is-open')) return;
                if (dd.contains(e.target)) return;
                dd.classList.remove('is-open');
                dd.querySelector('[data-track-action="toggle-menu"]')
                    ?.setAttribute('aria-expanded', 'false');
                dd.querySelector('.track-dropdown-menu')?.setAttribute('hidden', '');
            });
            this._trackDropdownDocBound = true;
        }

        tracksList._subtitleTrackEventsBound = true;
    }

    addDefaultTrack() {
        this.addTrack(window.i18n.t('subtitle.messages.mainTrack'), 'main');
    }

    createBatchTrackSnapshot(track) {
        if (!track) return null;

        return {
            id: track.id,
            name: track.name,
            type: track.type,
            subtitles: JSON.parse(JSON.stringify(track.subtitles || [])),
            visible: track.visible !== false,
            locked: !!track.locked,
            color: track.color,
            style: track.style ? JSON.parse(JSON.stringify(track.style)) : null,
            ttsAudioPath: track.ttsAudioPath || null,
            ttsGenerated: !!track.ttsGenerated
        };
    }

    exportBatchState() {
        const tracks = this.tracks
            .map((track) => this.createBatchTrackSnapshot(track))
            .filter(Boolean);

        if (!tracks.length) return null;

        const fallbackActiveTrackId = tracks.find((track) => track.id === this.activeTrackId)?.id
            || tracks.find((track) => track.type !== 'audio')?.id
            || tracks[0]?.id
            || null;

        return {
            activeTrackId: fallbackActiveTrackId,
            tracks
        };
    }

    restoreBatchState(state) {
        if (!state || !Array.isArray(state.tracks) || state.tracks.length === 0) {
            return false;
        }

        this.tracks = state.tracks.map((track) => ({
            ...JSON.parse(JSON.stringify(track)),
            history: [],
            historyIndex: -1,
            historyDirty: false
        }));

        this.activeTrackId = this.tracks.some((track) => track.id === state.activeTrackId)
            ? state.activeTrackId
            : (this.tracks.find((track) => track.type !== 'audio')?.id || this.tracks[0]?.id || null);

        const activeTrack = this.tracks.find((track) => track.id === this.activeTrackId) || null;

        if (activeTrack?.style) {
            this.flow.currentStyle = this.flow.styleManager?.cloneStyle
                ? this.flow.styleManager.cloneStyle(activeTrack.style)
                : activeTrack.style;
            this.flow.styleManager?.applyStyleToUI?.();
        }

        this.renderTracks();
        this.flow.editor?.render(activeTrack?.subtitles || []);
        this.flow.updateSubtitlePreview?.();
        return true;
    }

    /**
     * 婵犵數濮烽弫鎼佸磿閹寸姷绀婇柍褜鍓氶妵鍕即閸℃顏柛娆忕箻閺岋綁骞囬浣瑰創濠碘槅鍋呴敃銏ゅ蓟閻旈鏆嬮柟宄拌嫰椤忣厾绱撻崒姘偓褰掑箲閸パ屾綎?     * @param {string} name 
     * @param {string} type 
     */
    addTrack(name, type = 'subtitle') {
        const track = {
            id: Date.now(),
            name: name || window.i18n.t('subtitle.messages.trackTypes.defaultTrackName', { n: this.tracks.length + 1 }),
            type: type, // main, watermark, header, subtitle, audio
            subtitles: [], // 闂傚倷娴囬褏鈧稈鏅濈划娆撳箳濡や焦娅旈梻鍌欒兌椤牓顢栭崨顖滅煋闁割偅娲栭悞鍨亜閹哄秷鍏岄柍顖涙礃閵囧嫰濡搁妷锕€娅х紓渚囧枛椤兘骞冨鍫熷癄濠㈣泛鐭堥崥鍛存⒒娴ｅ憡鎯堢紒瀣╃窔瀹曘垺銈ｉ崘銊х厬闂佽鍨奸悘娑樷槈閵忊€充罕闂佸壊鍋呯换鍕鐎涙绡€闁靛繒濮寸敮銊╂煕鐎ｎ偅宕岄柡?(Audio Clips)
            visible: true,
            locked: false,
            color: this.getTrackColor(type),
            style: type === 'audio'
                ? null
                : (this.flow.styleManager?.cloneStyle
                    ? this.flow.styleManager.cloneStyle(this.flow.currentStyle)
                    : { ...this.flow.currentStyle }),
            // 闂傚倷绀侀幖顐λ囬柆宥呯；闁硅揪绠戠粈澶愭煙鐎电浠фい鈺傜叀閺屾盯骞樺Δ鈧幊蹇涙晬韫囨稒鍋℃繝濠傚暟瀛濆銈嗘煥缁绘垹鎹㈠┑鍡╂僵妞ゆ帒鍊婚崢顒勬⒒娴ｅ搫甯堕柕鍫熸倐璺柛宀€鍋涢懜褰掓煕閹捐尙鍔嶉柛鐘冲姍閺岋絽螖閳ь剟鎮ф繝鍕焼闁告劦鍠楅悡?
            history: [],
            historyIndex: -1
        };
        this.tracks.push(track);
        this.flow.editor?.addToHistory();
        
        if (type !== 'audio') {
            this.setActiveTrack(track.id);
        } else {
            this.renderTracks();
        }
    }

    /**
     * 濠?TTS 闂傚倸鍊风粈渚€骞夐敓鐘冲殞濡わ絽鍟崑瀣攽閻樺弶鎼愰柛銊ュ€归幈銊ノ熸径绋挎儓缂佺偓鍎抽妶鎼佸蓟閻旂厧绠氱憸婊堝吹閻旇鐟邦煥鎼达紕浠搁梺鍝勬湰閻╊垶鐛幒妤€绠婚柛銊︾⊕椤秶绱撻崒姘偓鎼佸磹瑜版帒绠伴柤濮愬€楅惌娆忣熆閼搁潧濮囬柣鎺戠仛閵囧嫰骞掑鍫濆帯闂佸磭绮褰掑Φ閸曨喚鐤€闁规崘娅曞▓鍫曟⒑閼姐倕鏆遍柡鍛Т椤繑绻濆顒傦紲濠碘槅鍨伴幖顐︹€栫€ｎ亖鏀介柣鎰皺婢ф盯鏌涢妸銉т虎閾荤偤鏌涘☉娆愮稇缂佺媭鍠氱槐鎺戔槈濮楀棗鍓卞┑鐐茬墔缁瑩寮婚埄鍐ㄧ窞閻忕偞鍨濋弶顓㈡⒑閸涘﹥鈷愰柛銊ュ缁?
     * @param {Object} result - { path: '...', words: [...] }
     * @param {Array} originalSubtitles - 闂傚倸鍊风粈渚€骞夐敓鐘偓锕傚炊椤掆偓缁愭骞栭幖顓犲帨缂傚秵鐗犻弻鐔兼焽閿曗偓閺嬫捇鏌涚€ｎ偅灏柍钘夘槸閳诲骸螣閼姐倖娈界紓鍌氬€烽懗鑸垫叏閻戣棄绀傛俊顖欒閸ゆ洘銇勯幇鍫曟闁稿顑夐弻娑㈩敃閿濆洨鐣奸梺闈涚墳闂勫嫮鎹㈠┑瀣潊闁挎繂妫涢妴鎰攽閻愰鍤嬬紓宥勭閻ｇ兘顢楅崟顐嬔冾熆鐠轰警鍎愭繛鍛墵閹宕楁径濠佸闂備線鈧偛鑻晶瀵糕偓娈垮櫘閸嬪﹥淇婇崼鏇炲耿婵炲棙蓱闁裤倝姊虹涵鍛汗閻炴稏鍎卞嵄闁告稒娼欓崥褰掓煟濡儤鈻曟繛纭风磿缁辨挻鎷呮慨鎴簼閹便劑宕惰閻斿棝鏌涜箛鎿冩Ц濞存粓绠栧?     */
    addAudioTrackFromTTS(result, originalSubtitles) {
        if (!result || !result.path) return;

        const trackName = `TTS - ${new Date().toLocaleTimeString()}`;
        this.addTrack(trackName, 'audio');
        
        const newTrack = this.tracks[this.tracks.length - 1];
        newTrack.ttsAudioPath = result.path;

        // 缂傚倸鍊烽懗鍫曞磻閹炬剚鐔嗘俊顖涙た濞堢晫绱掔€ｎ偒鍎ラ柣鎺嶇矙閺屻劑鎮㈤崫鍕戙垻绱掗埀顒€鐣濋崟顒傚幐閻庡箍鍎卞ú锕傚汲閳哄啰纾奸柟閭﹀弾濞堟粓鏌熼绛嬬劸缂佺姵鐩獮姗€骞栭鐕傜磼闂傚倷绀侀幖顐⑽涚€电绶ゅù鐘差儏閻撴繈鏌熼崜褏甯涢柛瀣ㄥ姂閺屾稑鈹戦崟顐㈠閻庣數澧楅幐缁樼┍婵犲浂鏁冮柕鍫濇媼閺嗩參姊洪幖鐐插婵炲绋戝畵鍕偡濠婂啰绠茬紒鍌氱Ч楠炴牗鎷呴崫銉Ч婵＄偑鍊曠换鎰洪妸鈹у洭鎮ч崼銏㈩啎闂佺懓顕崑鐐典焊椤撶倣鏃堟偐閾忣偄鈧劙鏌熼鈧紓姘端囪ぐ鎺撶厽婵炴垵宕▍宥団偓娈垮枟閹告娊骞冨鍫濆耿婵°倓绶￠崯鍛存⒒娴ｅ憡璐￠柛妯犲洦鍋ら柕濞垮労濞兼牠鎮归崶銊с偞闁哄妫冮弻鐔告綇閸撗呮殸缂備讲鍋撻柛顐ゅ枂娴滄粓鐓崶銊﹀鞍鐎瑰憡绻堥幃?
        // 闂傚倸鍊风粈渚€骞栭銈囩煋闁割偅娲嶉埀顒婄畵瀹曞ジ濮€閵忋垹顦╁┑掳鍊х徊浠嬪疮椤愩倗纾奸柍鍝勫暟濡垱銇勯幘璺轰沪闁革絿鏅槐鎺楁偐瀹割喚鍚嬮梺鍝勮閸斿矂鍩ユ径濞炬瀻闁归偊鍠楅濠氭⒒娴ｅ搫浠洪柛搴ゅ蔼閹筋偆绱撴担姝屽鐎规洦鍓熼崺鐐哄箣閻橆偄浜鹃柨婵嗛婢ь喚鈧數澧楅幐缁樼┍婵犲浂鏁冮柕鍫濇媼閺嗩參姊洪幖鐐插妞ゎ偄顦靛鏌ュ醇閺囩偛鍞ㄩ悷婊冾樀瀵悂寮崼鐔哄幈闂婎偄娲﹂幐濠氬箟閹间焦鐓熼柣鏃€娼欓悘鏌ユ煛鐏炲墽鈽夐摶锝夋煟閹惧啿顒㈤柣搴☆煼濮婃椽鎮滈埡渚囨綒闂佹悶鍎弲娑氱矈閿曞倹鈷戦柛婵嗗瀹告繈鏌涚€ｎ剙浠遍柣鎿冨墴椤㈡宕熼鍌氬箰闂備礁鎲￠崝鎴﹀礉鎼淬劌鏄ラ柨婵嗘缁诲棙銇勯幇鍓佸埌妞ゆ洘绮嶇换娑氬枈閸欐鏁栫紓浣介哺閻熲晠骞冮埡鍛仺闁割煈鍋勯弳鐔哥節閻㈤潧浠﹂柛銊ョ埣楠炴劙宕奸弴鐐碉紵闂佸搫琚崕鏌ュ磻鐎ｎ喗鐓曟繝闈涘閸旀鏌涚€ｎ偅宕屾俊顐㈠暙閳藉顫濆В娆嶅妿缁?
        let totalAudioOffset = 0;

        newTrack.subtitles = originalSubtitles.map((sub) => {
            // 濠电姷鏁搁崑娑㈩敋椤撶喐鍙忛悗娑欙供濞堜粙鏌熼梻瀵割槮缂佺姵鐗楁穱濠囧Χ閸涱厽娈堕梺鍛婎殕绾板秹濡甸崟顖氬唨闁靛ě鍛毉缂傚倷鑳舵慨鐢告偂閿熺姴钃熸繛鎴欏灩鍞悷婊冪У缁傛帟顦崇紒?clips 闂傚倸鍊峰ù鍥ь浖閵娾晜鍤勯柤绋跨仛濞呯姵淇婇妶鍌氫壕闂佷紮绲介悘姘跺箯閸涙潙鎹舵い鎾寸⊕閻忓啯淇婇悙顏勨偓鏍箰妤ｅ啫纾块柟鐗堟緲閸氬綊鏌曡箛瀣偓鏍偂濞嗘挻鐓曟い顓熷灥娴滄粓鏌涢弬璇测偓妤冩閹炬剚鍚嬮柛婊€绀侀崜鍫曟倵鐟欏嫭绀冪紒顔肩焸椤㈡ɑ绺界粙鍨獩濡炪倖鐗楃粙鎺楀窗閺囩喍绻嗛柕鍫濇搐鍟搁梺绋款儑閸嬫稓鍙呴梺鍝勭▉閸欏酣寮€ｎ偁浜滈柡鍐ㄦ搐琚氶梺绋挎捣閸犳牠寮婚敓鐘茬闁靛鍎崑鎾广亹閹烘挸浠奸梻渚囧墮缁夌敻鎮￠悢鎼炰簻闊洦鎸婚ˉ婊堟煛鐎ｎ亪鍙勯柡宀嬬秮婵″爼宕ㄩ褌绱旀繝纰樻閸嬪嫰骞婂鈧悰顔芥償閿濆洭鈹忛柣搴秵閸嬪懘顢欓弮鍫熲拻濞达絽鎲￠幆鍫ユ煕閻曚礁浜伴柟顔哄劜缁虹晫绮欓幐搴ょ发?
            const clipData = result.clips ? result.clips.find(c => c.id === sub.id) : null;
            const duration = clipData ? clipData.duration : (sub.end - sub.start);
            const clipStart = Number.isFinite(clipData?.startInFull) ? clipData.startInFull : sub.start;
            const clipEnd = Number.isFinite(clipData?.endInFull) ? clipData.endInFull : (clipStart + duration);
            const audioStartOffset = Number.isFinite(clipData?.startInFull) ? clipData.startInFull : totalAudioOffset;
            const audioEndOffset = Number.isFinite(clipData?.endInFull) ? clipData.endInFull : (audioStartOffset + duration);
            
            const clip = {
                id: Date.now() + Math.random(),
                originId: sub.id,
                start: clipStart,
                end: clipEnd,
                text: this.flow.ttsHandler?.getSubtitleSpeechText?.(sub) || sub.translatedText || sub.originalText || sub.text,
                audioPath: result.path,
                audioStartOffset,
                audioEndOffset
            };

            // 闂傚倸鍊烽懗鍓佸垝椤栫偛桅婵炴垯鍨归悿鐐節闂堟侗鍎忕紒鐘崇墪閳规垿鎮╅崣澶嬫倷缂佺偓鍎抽…鐑芥偂椤愶箑鐐婇柕濠忕畵閺嗛亶姊洪崘鍙夋儓闁瑰啿閰ｅ畷锟犲箮閼恒儱鈧灚绻涢幋鐑嗕紗闁硅揪闄勯崑鍌炴煃瑜滈崜鐔奉潖濞差亜绠伴幖杈剧岛婵洭姊哄ú璇插季闁哥姵姘ㄩ崚鎺楊敇閵忕姴绐涘銈嗘閺侇噣寮搁弽顓熲拺闂侇偆鍋涢懟顖涙櫠椤栨粎纾奸悗锝庝憾濡偓濡炪們鍨哄Λ鍐ㄧ暦閻旂⒈鏁冩い鎰剁岛閹稿嫰姊绘担鍛婃儓妞わ富鍨堕幃褎绻濋崶褍鐎梻鍌氱墛閸愬鎳撻幐搴涗簻闊洦鎸炬晶鏇㈡偡濞嗘瑧鐣甸柡灞剧洴椤㈡洟鏁愰崶鈺冩毎闂佽瀛╃喊宥夋偡閳哄懎钃熼柨鐔哄Т绾惧吋鎱ㄥ鍡楀箻闁绘挻鍨甸埞鎴︽倷閸欏妫戦梺鎼炲姀濞咃絿鍒掑▎鎰窞闁规澘鐏氶弲锝夋⒑缂佹◤顏嗗椤撱垹姹查柣妯虹－缁犻箖寮堕崼婵嗏挃闁告帗澹嗙槐鎺撳緞婵犲嫬鐓熼梺?
            totalAudioOffset = audioEndOffset;

            return clip;
        });

        this.renderTracks();
        if (this.flow.timeline) this.flow.timeline.render();
        
        window.app?.showToast?.(window.i18n.t('subtitle.messages.audioTrackCreated'), 'success');
    }

    /**
     * 缂傚倸鍊搁崐椋庣矆娓氣偓钘濇い鏍亹閳ь剨绠戦悾锟犲箥閾忣偆鈧椽鏌熼崗鑲╂殬闁搞劎鍎ら幈銊ヮ煥閸喓鍘繝鐢靛仧閸嬫挸鈻嶉崘顭戠唵?
     * @param {number} id 
     */
    removeTrack(id) {
        const index = this.tracks.findIndex(t => t.id === id);
        if (index > -1) {
            this.flow.editor?.addToHistory();
            this.tracks.splice(index, 1);
            this.flow.editor?.addToHistory();
            if (this.activeTrackId === id && this.tracks.length > 0) {
                this.setActiveTrack(this.tracks[0].id);
            } else if (this.tracks.length === 0) {
                this.activeTrackId = null;
                this.renderTracks();
                // clear editor?
                if (this.flow.editor) this.flow.editor.render([]);
            } else {
                this.renderTracks();
            }
        }
    }

    /**
     * 婵犵數濮烽弫鎼佸磻閻愬搫绠伴柟闂寸缁犵娀鏌熼悧鍫熺凡闁绘挻锕㈤弻鈥愁吋鎼粹€崇缂備胶濮伴崕鐢稿蓟瀹ュ牜妾ㄩ梺鍛婃尵閸犲酣顢氶敐澶婂瀭妞ゆ劑鍨荤粣鐐烘煙閼圭増褰х紒杈ㄦ礈濡叉劙鏁冮崒娑掓嫽?     */
    clearAllTracks() {
        this.flow.editor?.addToHistory();
        this.tracks = [];
        this.activeTrackId = null;
        this.renderTracks();

        // Clear editor
        if (this.flow.editor) {
            this.flow.editor.render([]);
        }

        // Add back default main track
        this.addDefaultTrack();
        this.flow.editor?.addToHistory();
    }

    /**
     * 闂傚倷娴囧畷鍨叏瀹曞洨鐭嗗ù锝堫潐濞呯姴霉閻樺樊鍎愰柛瀣典邯閺屾盯鍩勯崘銊︽儧婵炲瓨绮岀紞濠囧蓟閻旂厧绠氱憸宥夊汲鏉堛劊浜滈柕鍫濇噺閸ｈ櫣绱掔紒妯肩畼闁哥姴锕よ灒閺夌偞婢橀ˉ姘攽閻樺灚鏆╅柛瀣☉椤曪絿鎹勬担鏇秮楠炴帡骞嬮鐐寸暭婵犵數鍋涘Ο濠冪濠靛鍊?     * @param {number} id 
     */
    setActiveTrack(id) {
        this.flow.editor?.addToHistory(true);
        this.activeTrackId = id;

        const track = this.tracks.find(t => t.id === id);
        if (track) {
            // 婵犵數濮烽弫鍛婃叏閻戝鈧倹绂掔€ｎ亞锛涢梺瑙勫劤椤曨厾绮绘ィ鍐╃厾缁炬澘宕晶浼存偨椤栨稓鈯曞ǎ鍥э躬閹瑩骞撻幒鍡椾壕閻犲洦绁村Σ鍫ユ煟閵忕姴顥忛柡浣革躬閺屻倖鎱ㄩ幇顑藉亾濡ゅ拋鏁婇柡鍐ㄧ墛閻撶喖骞栨潏鍓хɑ闁搞倐鍋撻梻浣告憸閸ｃ儵宕归弶鍨カ闂備礁缍婂Λ璺ㄧ矆娓氣偓閹苯螖娴ｅ吀绨婚梺鍝勭Р閸斿海绮婚妷锔剧闁绘挸娴烽悞鎼佹煛?(闂傚倸鍊风粈渚€骞夐敓鐘冲仭妞ゆ牜鍋涢崹鍌炴煕椤愶絾绀€闁绘帒鐏氶妵鍕箳閸℃ぞ澹曟俊鐐€ф俊鍥极婵犳艾鏄ラ柍褜鍓氶妵鍕箳瀹ュ洤濡藉銈庡亝椤ㄥ牏妲愰幒鎿勭矗婵犻潧妫旈崰濠囨⒑鏉炴壆顦︾紒澶庡煐缁傛帡鏁冮崒姘辩暰閻熸粌绻樺畷鎰板箳濡や讲鎷洪梺鍛婄☉椤剙鈻撻弮鈧换娑氭嫚瑜忛幃鑲╃磼鏉堚晛浠ч柍褜鍓ㄧ紞鍡涘磻閹烘垟鏋?
            // track.visible = true; 

            // Sync style back to flow (UI reflection)
            if (track.style) {
                // 闂傚倸鍊烽懗鍫曞磿閻㈢鐤炬繛鎴欏灪閸嬨倝鏌曟繛褍瀚▓浼存煟鎼淬劍娑ч柟璇х磿娴滃憡鎯旈妸锕€鈧敻鏌ㄥ┑鍡欏嚬缂併劍鎸抽弻娑氣偓锝庡亝瀹曞矂鏌熼搹顐ょ疄婵☆偄鍟撮幊婊堝垂椤愩値妲归柣?flow.currentStyle setter
                this.flow.currentStyle = this.flow.styleManager?.cloneStyle
                    ? this.flow.styleManager.cloneStyle(track.style)
                    : track.style;
                if (this.flow.styleManager) {
                    this.flow.styleManager.applyStyleToUI();
                }
            }

            // Sync Editor
            if (this.flow.editor) {
                this.flow.editor.render(track.subtitles || []);
            }
        }

        this.renderTracks();
        this.flow.updateActiveTrackMeta?.();
    }

    /**
     * 闂傚倸鍊风粈渚€骞夐敍鍕殰闁圭儤鍤氬ú顏呮櫇闁逞屽墴閹箖鎮滈挊澶岀厬婵犮垼娉涢鍛达綖閿熺姵鈷戦梻鍫熷崟閸儱鐤炬繛鍡樺姉閻濆爼鏌￠崶銉ョ仾闁绘挻娲樼换娑㈠幢濡浚浜幃姗€濡烽敂杞扮盎濡炪倖鍔戦崹娲夐姀鈽嗘闁绘劏鏅涙禍?     */
    toggleVisibility(id) {
        const track = this.tracks.find(t => t.id === id);
        if (track) {
            this.flow.editor?.addToHistory();
            track.visible = !track.visible;
            this.flow.editor?.addToHistory();
            this.renderTracks();
            // 闂傚倸鍊搁崐椋庢閿熺姴纾婚柛娑卞弾濞尖晠鏌曟繛鐐珕闁稿鍊块弻宥夊煛娴ｅ憡鐏曠紓浣瑰敾缂嶄線寮诲☉銏犲嵆闁靛鍎查悵顔尖攽閻愭彃鎮戞俊顐㈠暣瀵寮撮姀鐘茶€块梺鍝勬川婵瓨淇婇挊澶嗘斀闁挎稑瀚禒婊堟煕婵犲倻浠㈡い顐㈢箻閹筹繝濡堕崪浣诡棥闂佽鍑界紞鍡涘窗閺嶎兙浜规繛鍡樻尰閳锋垿鏌涘☉姗堝姛闁活厼锕弻锝夘敆閸愩劋姹楀┑鈥冲级閸旀瑩銆侀弮鍫濆窛妞ゆ柨澧借倴闂傚倷鑳堕幊鎾绘偤閵娧勫床闁告劦鍠楅崑鐔兼煏閸繍妲归柣鎾存礋閺岀喖鎮滃鍡樼暦闂佽桨绶氭禍鍫曞蓟?(缂傚倸鍊搁崐鎼佸磹閹间礁纾圭憸鐗堝笚閸嬪鏌ｉ幇顒備粵妞ゆ劘濮ら妵鍕箛閸撲胶鏆犻梻鍌氬亞閸ㄥ爼寮婚弴鐔虹闁割煈鍠栨慨搴ㄦ⒑缂佹ɑ灏版繛鑼枛瀵鏁撻悩鑼紲濠电姴锕ら崰姘跺汲椤撶偐鏀介柍鈺佸暙缁插鏌熺拠褏纾跨紒顔界懄瀵板嫮鈧綆鍋勯～锟犳⒑鐟欏嫷鍟忛柛鐘崇墵瀵煡鍩￠崨顔规嫼闂佸憡绋戦敃銊︾珶濮椻偓閺岋繝宕奸銏犫拫濡炪們鍨洪〃濠囧箖濞嗘挸浼犻柛鏇ㄥ亜閹搞倝姊绘担鍛婂暈闁圭妫欓幏鍛槹鎼淬劉鏀?闂傚倸鍊搁崐鎼佸磹閹间礁绠犻煫鍥ㄧ☉缁€澶嬩繆椤栨瑧绉挎繛鎴烆焽閺嗗棝鏌涢弴銊ヤ簽妞わ富鍋勯埞鎴炲箠闁稿﹥娲滈埀顒佸搸閸旀垿宕洪埀顒併亜閹哄棗浜鹃梺鍝ュ枑濞兼瑩鎮惧畡閭︽建闁逞屽墮閻ｇ兘濡搁埡濠冩櫖濠电偞鍨剁喊宥呪枔閹间焦鈷掗柛灞捐壘閳ь剚鎮傞弫鍐Ψ閿斿墽顔曟繝鐢靛Т濞层垽鍩€椤掆偓閸婂潡骞婂鍛瀳濠㈣泛鐬奸悡鎴︽⒒娴ｅ憡鍟炴繛璇х畵瀹曟娊顢欑喊杈╁姺闂佸搫鍟悧濠囧磻?
            if (this.flow.updateSubtitlePreview) this.flow.updateSubtitlePreview();
            if (this.flow.editor) this.flow.editor.render();
        }
    }

    /**
     * 闂傚倸鍊风粈渚€骞夐敍鍕殰闁圭儤鍤氬ú顏呮櫇闁逞屽墴閹箖鎮滈挊澶岀厬婵犮垼娉涢鍛达綖閿熺姵鈷戦梻鍫熷崟閸儱鐤炬繛鍡樺姉閻濆爼鏌￠崶銉ョ仾闁抽攱鍨甸…璺ㄦ崉閻戞ɑ鍠愬銈忚缁犳捇寮婚敐澶嬫櫜濠㈣泛鐬奸弳顐︽⒑鐠団€虫灀闁哄懐濞€楠炲﹤顭ㄩ崨顓熺€冲┑鈽嗗灥濡椼劍绔?     */
    toggleLock(id) {
        const track = this.tracks.find(t => t.id === id);
        if (track) {
            this.flow.editor?.addToHistory();
            track.locked = !track.locked;
            this.flow.editor?.addToHistory();
            this.renderTracks();
            if (this.flow.timeline) this.flow.timeline.render();
        }
    }

    /**
     * 闂傚倸鍊风粈渚€骞栭銈囩煋闁绘垶鏋荤紞鏍ь熆鐠虹尨鍔熼柡鍡愬€曢湁闁挎繂鐗滃鎰攽椤旂晫鐭掗柡灞炬礃缁绘盯鎮欓浣哄絻濠电姰鍨奸～澶娒哄鍛潟闁圭儤顨忛弫鍐煏婢舵ê鏋涙繛鍫弮濮婅櫣鎷犻崣澶嬪闯闂佺绻戦敃銏ょ嵁婵犲洤顫呴柣妯虹仛濞堟繈姊洪崫鍕垫Ъ婵炲娲熼獮鍐╃附閸涘ň鎷洪梺鍛婄箓鐎氼喖鐡繝鐢靛仦缁佹挳寮查悩璇茬畾濞撴埃鍋撴鐐差儔閺佸倿鎸婃径瀣澖?     */
    getTrackColor(type) {
        const colors = {
            main: '#6b9ad4',    // Indigo
            watermark: '#f472b6', // Pink
            header: '#34d399',   // Emerald
            audio: '#4d82c9',    // Purple for Audio
            custom: '#fbbf24'    // Amber
        };
        return colors[type] || '#94a3b8';
    }

    /**
     * 闂傚倷娴囬褏鑺遍懖鈺佺筏濠电姵鐔紞鏍ь熆閼搁潧濮囨慨瑙勭叀閺屻劌鈹戦崱姗嗘！婵犳鍠楃划鎾诲蓟閺囩喓绠鹃柛顭戝枛婵垽姊洪崷顓熸珪闁哥姵鍔欓妴鍐Ψ閳哄倸鈧兘鎮楀☉娆樼劷妞わ富鍠氱槐鎾存媴閾忕懓绗″銈庡幖濞差參鐛崘顔肩妞ゆ梻绮崟鍐⒑缂佹ê濮﹂柛鎿勭畱鍗辨い鏍仦閳锋帡鏌涚仦鎹愬闁逞屽墰閹虫捇鈥﹂崶褉鏋庨柟閭﹀櫘濞叉悂姊洪崨濠勭細闁稿孩濞婇幆?(Shift)
     */
    shiftTrack(trackId, offsetSeconds) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track || track.locked) return false;
        if (Math.abs(offsetSeconds) < 0.001) return false;

        this.flow.editor?.addToHistory(); // 闂傚倸鍊烽懗鍫曞箠閹剧粯鍊舵繝闈涚墢閻挾鈧娲栧ú銊х矆婵犲洦鐓涢柛鎰╁妿婢ф洜绱掗埀顒勫醇閳垛晛浜炬鐐茬仢閸旀岸鎮楀鐓庢灓缂侇喚绮粋鎺斺偓锝庡亜閳?
        track.subtitles.forEach(sub => {
            sub.start = Math.max(0, sub.start + offsetSeconds);
            sub.end = Math.max(sub.start + 0.1, sub.end + offsetSeconds);
        });

        this.renderTracks();
        if (this.flow.timeline) this.flow.timeline.render();
        if (this.flow.updateSubtitlePreview) this.flow.updateSubtitlePreview();

        this.flow.editor?.addToHistory(); // 闂傚倸鍊烽懗鍫曞箠閹剧粯鍊舵繝闈涚墢閻挾鈧娲栧ú銊х矆婵犲洦鐓涢柛鎰╁妿婢ф洟鎮峰▎娆戠暤妤犵偞鐗滈埀顒佺⊕椤洨绮诲Ο鑲╃＜闁绘浜惌娆撴煙?        return true;
    }

    /**
     * 闂傚倸鍊风欢姘焽閼姐倖瀚婚柣鏃傚帶缁€澶愮叓閸ャ劍鎯勯柛銈呯墛缁绘稑顔忛鑽ゅ嚬闂佺粯甯掗妶鎼佸蓟閻旂厧绠查柟閭﹀墰濮ｃ垹顪冮妶鍡樺鞍婵＄偠妫勯～蹇旂節濮橆剛锛滃┑鐘诧工鐎涒晠藟閹炬枼鏀介柣鎰摠缂嶆垶淇婇锝囥€掗柛鎺撳浮瀵噣宕掑☉妯煎酱闂備浇鍋愰埛鍫ュ礈濮樿泛绠熼悹鍥у棘?(闂傚倸鍊烽悞锕€顪冮崹顕呯劷闁秆勵殔缁€澶愭倵閿濆骸澧插┑顔挎珪閵囧嫰骞掗幋婵冨亾閻熸壆鏆﹀鑸靛姈閻撳繐鈹戦悙鑼虎濠德ゅ亹缁辨捇宕掑☉娆忕３濠殿喖锕ュ浠嬨€佸Δ浣瑰闁荤喍鍗抽悗娲⒑鐠囨彃顒㈤柤褰掔畺椤㈡牗寰勯幇顔肩ウ?
     */
    moveSubtitleBetweenTracks(fromTrackId, toTrackId, subtitleIndex) {
        const fromTrack = this.tracks.find(t => t.id === fromTrackId);
        const toTrack = this.tracks.find(t => t.id === toTrackId);

        if (!fromTrack || !toTrack || fromTrack === toTrack) return null;
        if (fromTrack.locked || toTrack.locked) return null;

        // 1. 濠电姷鏁搁崑娑㈩敋椤撶喐鍙忛悗鐢电《閸嬫挸鈽夐幒鎾寸彇闂佸吋妞芥禍鍫曘€佸▎鎾村殟闁靛鍎哄顖炴⒒娓氣偓濞佳嗗闂佸搫鎳忛悷锔剧博閻旂厧鍗抽柕蹇ョ磿閸樺崬鈹戦悙鍙夘棡闁告梹顨嗛弲鍫曨敂閸喓鍘遍梺闈涚墕妤犳悂鐛鈧弻宥堫檨闁告挻姘ㄧ划娆撳箳濡炲皷鍋撻崘顔煎窛妞ゆ牗绮堢粭?
        const [subtitle] = fromTrack.subtitles.splice(subtitleIndex, 1);
        if (!subtitle) return null;

        // 2. 闂傚倸鍊风粈浣革耿鏉堚晛鍨濇い鏍ㄧ矋閺嗘粓鏌熼悜姗嗘當闁活厽顨婇弻娑㈠焺閸愵亖濮囬梺绋块鐎涒晠濡甸崟顖氱睄闁稿本绋掗悵顏堟⒑閹肩偛濡奸柕鍫㈩焾椤曪綁宕奸弴鐔封偓閿嬨亜韫囨挸顏╂い顐㈡处缁?
        toTrack.subtitles.push(subtitle);

        // 3. 闂傚倸鍊烽懗鍫曞磿閻㈢鐤鹃柍鍝勬噹缁愭淇婇妶鍛櫤闁稿顦甸弻銊モ攽閸℃﹩妫℃繝娈垮枟缁捇寮婚弴鐔虹闁绘劦鍓氶悵鎺撶節閵忥綆娼愭繛鑼枎椤繐煤椤忓嫮顔岄梺鍦劋閺嬵剟鏁愭径瀣幐闁诲繒鍋為弸濠氱叕椤掍緡娈介柣鎰綑婵牏鈧灚婢樼€氼噣鍩€椤掑﹦绉甸柛瀣笒鍗辨い鏍仦閳锋帡鏌涚仦鎹愬闁逞屽墯閹倿骞冨ú顏勎╃憸搴ㄥ汲濠婂牊鐓欓柟顖嗗懏鎲奸梺?(濠电姷鏁搁崑鐐哄垂閸洖绠板┑鐘宠壘缁犳澘顪冪€ｎ亝鎹ｇ紒鐘虫閺岋綁寮崒姘粯闂佸搫瀚ㄩ崕鐢稿蓟瑜戠粻娑橆潩閻撳孩鐣伴梻浣姐€€閸嬫捇鏌曟繛鐐珕闁绘挶鍎茬换娑㈠箣閻愬灚鍣梺缁樻惄閸ㄥ磭妲愰幒鏃傜＜婵☆垰鎼幗闈浳旈悩闈涗沪闁告梹鐗犻獮蹇涘川椤栨稑鏋傞梺鍛婃礀閻忔俺鈪堕梻鍌氬€搁崐鎼佸磹閹间礁纾归柟闂寸贰閺佸銇勯幘鍗炵仼闁告艾缍婇獮鏍庨鈧俊鑲╃磼?
        toTrack.subtitles.sort((a, b) => a.start - b.start);

        // 4. 闂傚倸鍊搁崐鐑芥倿閿曚降浜归柛鎰典簽閻捇鏌涢锝嗙闁稿鏅涢埞鎴︽偐鐎圭姴顥濆┑鈽嗗亝閿曘垽寮婚悢灏佹灁闁割煈鍠楅悘鍫ユ⒑缁嬫鍎忕紒澶婄埣閸┾偓妞ゆ帊绶￠崯蹇涙煕閻樻剚娈旈悡銈夋煛瀹ュ骸骞楅柛銈嗗姍閺岋綁寮崹顔藉€梺缁樺笩椤曆団€︾捄銊﹀磯濞撴凹鍨辨瓏闂?(濠电姷鏁告慨鐑姐€傛禒瀣劦妞ゆ巻鍋撻柛鐔锋健閸┾偓妞ゆ巻鍋撶紓宥咃躬楠炲啫螣鐠囪尙绐為梺褰掑亰閸樺ジ宕滈纰辨富闁靛牆妫欓埛鎺楁煛閸滀礁浜扮€规洝顫夌缓鐣岀矙鐠恒劑鐛撻梻浣虹帛閸旓附绂嶅鍕弿闁稿本顕㈤悷閭︾叆闁割偁鍨婚弳顐︽倵濞堝灝鏋欓柛妤佸▕閵嗕礁鈽夊鍡樺兊闁哄鐗冮弫鈺咁敂閸啿鎷洪梺鍛婄☉閿曘儳浜搁鐘电＜濠㈣埖鍔栧☉褎銇勯鍕殶闁圭懓瀚版俊鎼佹晝閳ь剛澹曢鐐粹拺闁告稑锕ゆ慨锕傛煕濡灝浜圭紒杈ㄦ崌楠炴绱掑Ο閿嬪?
        const newIndex = toTrack.subtitles.indexOf(subtitle);

        // 5. 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫇娑撳秹鏌熸潏鍓хシ濞存粌缍婇弻娑氫沪閹勬儧闂侀€炲苯澧悽顖椻偓宕囨殾闁挎繂妫楃欢鐐烘倶閻愯埖顥夐柤?
        this.renderTracks();
        if (this.flow.timeline) this.flow.timeline.render();

        if (this.flow.activeTrackId === toTrackId) {
            this.flow.editor?.setActive(newIndex, true);
        }

        return { newIndex };
    }

    /**
     * 婵犵數濮烽弫鎼佸磻閻愬搫绠扮紒瀣儥閸ゆ洟鏌涢锝嗙闁稿鍊块幃妤呮晲鎼粹€茬凹婵犳鍠楃划鎾诲蓟閺囩喓绠鹃柣鎰靛墯閻濇帗绻濋姀锝庢綈婵炶尙鍠栧璇测槈閵忕姷顔婇梺鐟扮仢閸燁垶鎮炬禒瀣拺?
     */
    renderTracks() {
        const { tracksList } = this.elements;
        if (!tracksList) return;

        const singleTrackMode = this.tracks.length <= 1;
        tracksList.classList.toggle('track-list-single', singleTrackMode);
        tracksList.classList.add('track-picker');
        tracksList.closest('.embedded-tracks-toolbar')?.classList.toggle('single-track-mode', singleTrackMode);
        tracksList.closest('.embedded-tracks-toolbar')?.classList.add('track-picker-toolbar');

        const active = this.tracks.find((t) => t.id === this.activeTrackId) || this.tracks[0];
        const activeId = active?.id;
        const isVisible = active?.visible !== false;
        const isAudio = active?.type === 'audio';

        const menuItems = this.tracks.map((track) => {
            const isActive = track.id === activeId;
            const typeLabel = this.getTrackTypeLabel(track.type);
            const meta = [];
            if (typeLabel) meta.push(typeLabel);
            if (track.ttsGenerated) meta.push('TTS');
            if (track.visible === false) meta.push('隐藏');
            const metaText = meta.length ? meta.join(' · ') : '';
            return `
                <button type="button"
                    class="track-dropdown-item ${isActive ? 'is-active' : ''}"
                    data-track-action="select"
                    data-id="${this.escapeAttribute(track.id)}"
                    role="option"
                    aria-selected="${isActive ? 'true' : 'false'}">
                    <span class="track-dropdown-item-name">${this.escapeHtml(track.name)}</span>
                    ${metaText ? `<span class="track-dropdown-item-meta">${this.escapeHtml(metaText)}</span>` : ''}
                    ${isActive ? '<i class="fa-solid fa-check track-dropdown-check" aria-hidden="true"></i>' : ''}
                </button>`;
        }).join('');

        const visTitle = isAudio
            ? (isVisible ? '静音' : '取消静音')
            : (isVisible ? '隐藏轨道' : '显示轨道');
        const visIcon = isAudio
            ? (isVisible ? 'fa-volume-high' : 'fa-volume-xmark')
            : (isVisible ? 'fa-eye' : 'fa-eye-slash');
        const activeName = active?.name || '—';

        // Custom dark dropdown (native <select> cannot theme the OS popup)
        tracksList.innerHTML = `
            <div class="track-dropdown" id="subtitle-track-dropdown">
                <button type="button"
                    id="subtitle-track-select-btn"
                    class="track-dropdown-trigger"
                    data-track-action="toggle-menu"
                    data-id="${this.escapeAttribute(activeId)}"
                    title="切换字幕轨道"
                    aria-label="切换字幕轨道"
                    aria-haspopup="listbox"
                    aria-expanded="false">
                    <span class="track-dropdown-label">${this.escapeHtml(activeName)}</span>
                    <i class="fa-solid fa-chevron-down track-dropdown-caret" aria-hidden="true"></i>
                </button>
                <div class="track-dropdown-menu" role="listbox" hidden>
                    ${menuItems || '<div class="track-dropdown-empty">暂无轨道</div>'}
                </div>
            </div>
            <button type="button" class="btn-icon btn-sm track-picker-btn"
                data-track-action="toggle-visibility"
                data-id="${this.escapeAttribute(activeId)}"
                title="${this.escapeAttribute(visTitle)}"
                aria-label="${this.escapeAttribute(visTitle)}">
                <i class="fa-solid ${visIcon}"></i>
            </button>
            ${singleTrackMode ? '' : `
            <button type="button" class="btn-icon btn-sm track-picker-btn danger"
                data-track-action="remove"
                data-id="${this.escapeAttribute(activeId)}"
                title="删除当前轨道"
                aria-label="删除当前轨道">
                <i class="fa-solid fa-trash-can"></i>
            </button>`}
        `;

        if (this.flow.audioManager) {
            this.flow.audioManager.syncTracks();
        }
        this.flow.updateActiveTrackMeta?.();
    }

    getTrackTypeLabel(type) {
        const labels = {
            'main': window.i18n.t('subtitle.messages.trackTypes.main'),
            'watermark': window.i18n.t('subtitle.messages.trackTypes.watermark'),
            'header': window.i18n.t('subtitle.messages.trackTypes.header'),
            'subtitle': window.i18n.t('subtitle.messages.trackTypes.subtitle'),
            'audio': window.SubtitleUtils?.translateOrFallback?.('subtitle.messages.trackTypes.audio', 'Audio') || 'Audio',
            'custom': window.i18n.t('subtitle.messages.trackTypes.custom')
        };
        return labels[type] || window.i18n.t('subtitle.messages.trackTypes.custom');
    }

    /**
     * 闂傚倷娴囬褍霉閻戣棄鏋侀柟闂寸閸屻劎鎲搁弬璺ㄦ殾闁挎繂顦獮銏＄箾閸℃瀚板ù婊呭亾缁绘盯骞嬮悙鍨櫧濠电偛鐗婂鑽ゆ閹烘鍋愰梻鍫熺☉楠炲鎮楀▓鍨珮闁告挾鍠庨悾鐑藉醇閺囩喐娅嗙紓浣圭☉椤戝懏绂?
     */
    async importSubtitle() {
        const result = await window.mediaflow?.dialog?.openFile({
            title: window.i18n.t('subtitle.messages.importSubTitle'),
            filters: [{ name: 'Subtitle', extensions: ['srt', 'ass', 'vtt'] }]
        });

        if (result) {
            try {
                const subtitles = await window.mediaflow?.subtitle?.parseSrt(result);
                if (subtitles && subtitles.length > 0) {
                    // Update Active track if possible, or Main track
                    const activeTrack = this.tracks.find(t => t.id === this.activeTrackId);
                    if (activeTrack) {
                        activeTrack.subtitles = subtitles;
                        window.app?.showToast?.(window.i18n.t('subtitle.messages.importDone', { count: subtitles.length }), 'success');
                        // Refresh Editor if active
                        if (this.activeTrackId === activeTrack.id && this.flow.editor) {
                            this.flow.editor.render(subtitles);
                        }
                    } else {
                        // Fallback to main
                        const mainTrack = this.tracks.find(t => t.type === 'main');
                        if (mainTrack) {
                            mainTrack.subtitles = subtitles;
                            window.app?.showToast?.(window.i18n.t('subtitle.messages.importDoneMain', { count: subtitles.length }), 'success');
                            this.setActiveTrack(mainTrack.id);
                        }
                    }
                }

            } catch (e) {
                console.error('Import failed:', e);
                window.app?.showToast?.(window.i18n.t('subtitle.messages.importFailed') + e.message, 'error');
            }
        }
    }
}

window.SubtitleTrackManager = SubtitleTrackManager;
