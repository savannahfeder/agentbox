// A labelled text field from the sign-in pages; a password one can be shown.
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { CORNER, Label } from './Onboarding';
import { T } from './parts';
import { color, font } from './theme';

export function Field({ label, secureTextEntry, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ marginLeft: 2 }}>{label}</Label>
      <View style={{ justifyContent: 'center' }}>
        <TextInput placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} {...rest} secureTextEntry={secureTextEntry && !shown}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[{ height: 48, paddingLeft: 14, paddingRight: secureTextEntry ? 64 : 14, borderRadius: CORNER.small, borderWidth: 1, borderColor: focused ? color.accent : color.lineStrong, backgroundColor: color.field, fontFamily: font.regular, fontSize: 16, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {secureTextEntry && (
          <Pressable onPress={() => setShown(!shown)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={6}
            style={{ position: 'absolute', right: 0, height: 48, paddingHorizontal: 14, justifyContent: 'center' }}>
            <T style={{ fontSize: 14, color: color.dim }}>{shown ? 'Hide' : 'Show'}</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
