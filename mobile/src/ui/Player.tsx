// A film or a sound in the phone's own player (expo-video), with full screen.
// A film shows its first frame under one centred mark of ours until it is
// tapped (lib/files.ts `filmFace`); a sound has only the control bar. The
// browser preview draws the page's own <video> (Player.web.tsx).
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { filmFace } from '../lib/files';
import { T } from './parts';
import { color } from './theme';

// The player's own control bar needs this much to be pressable; a sound has nothing else to show.
const SOUND_HEIGHT = 64;

function PlayMark() {
  return (
    <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.55)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.18)' }}>
      {/* Nudged right of centre so the triangle's weight, not its box, sits in the middle. */}
      <Svg width={20} height={22} viewBox="0 0 20 22" style={{ marginLeft: 3 }}><Path d="M2 1.5v19L19 11z" fill={color.text} /></Svg>
    </View>
  );
}

export function Player({ link, film, style }: { link: string; film: boolean; style?: ViewStyle }) {
  const player = useVideoPlayer(link);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [tapped, setTapped] = useState(false);
  if (!film) {
    return (
      <View style={[{ overflow: 'hidden' }, style, { height: SOUND_HEIGHT }]}>
        <VideoView player={player} nativeControls style={{ flex: 1 }} />
      </View>
    );
  }
  const face = filmFace({ status, tapped });
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <VideoView player={player} nativeControls={face === 'controls'} contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture={false}
        style={{ flex: 1 }} />
      {face !== 'controls' && (
        <Pressable accessibilityRole="button" accessibilityLabel={face === 'play' ? 'Play' : face === 'error' ? 'This film cannot be played' : 'Loading'}
          disabled={face !== 'play'} onPress={() => { setTapped(true); player.play(); }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          {face === 'play' ? <PlayMark /> : face === 'error'
            ? <T style={{ fontSize: 13, color: color.dim }}>This film cannot be played here.</T>
            : <ActivityIndicator color={color.dim} />}
        </Pressable>
      )}
    </View>
  );
}
