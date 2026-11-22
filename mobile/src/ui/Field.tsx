// A labelled text field from the sign-in pages; a password one can be shown.
import { useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Label } from './Onboarding';
import { T } from './parts';
import { color, corner, font } from './theme';

export function Field({ label, secureTextEntry, ...rest }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Label style={{ marginLeft: 4 }}>{label}</Label>
      <View style={{ justifyContent: 'center' }}>
        <TextInput placeholderTextColor={color.faint} autoCapitalize="none" autoCorrect={false} {...rest} secureTextEntry={secureTextEntry && !shown}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={[{ height: 54, paddingLeft: 18, paddingRight: secureTextEntry ? 68 : 18, borderRadius: corner.small + 4, borderWidth: 1.5, borderColor: focused ? color.text : 'transparent', backgroundColor: color.card, fontFamily: font.regular, fontSize: 16.5, color: color.text }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]} />
        {secureTextEntry && (
          <Pressable onPress={() => setShown(!shown)} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'} hitSlop={6}
            style={{ position: 'absolute', right: 0, height: 54, paddingHorizontal: 18, justifyContent: 'center' }}>
            <T style={{ fontSize: 14.5, fontFamily: font.medium, color: color.dim }}>{shown ? 'Hide' : 'Show'}</T>
          </Pressable>
        )}
      </View>
    </View>
  );
}
