// A film or a sound in the phone's own player (expo-video): its own controls,
// its own spinner while it loads, and full screen. The browser preview draws
// the page's own <video> (Player.web.tsx).
import { useVideoPlayer, VideoView } from 'expo-video';
import { View, type ViewStyle } from 'react-native';

// The player's own control bar needs this much to be pressable; a sound has nothing else to show.
const SOUND_HEIGHT = 64;

export function Player({ link, film, style }: { link: string; film: boolean; style?: ViewStyle }) {
  const player = useVideoPlayer(link);
  return (
    <View style={[{ overflow: 'hidden' }, style, film ? null : { height: SOUND_HEIGHT }]}>
      <VideoView player={player} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} allowsPictureInPicture={false}
        style={{ flex: 1 }} />
    </View>
  );
}
