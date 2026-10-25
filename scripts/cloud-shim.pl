#!/usr/bin/perl
# A CLOUD RUN, AS THE SUPERVISOR SEES IT: one small process standing in for a
# run whose relay lives in the shared host (main/cloud/host.mjs). It carries
# its input, output, signals and exit code there and back. Perl, because every
# Mac has it and a stand-in in it costs a few megabytes.
#
#   cloud-shim.pl <host socket> <the relay's own arguments ...>
use strict;
use warnings;
use IO::Socket::UNIX;
use IO::Select;
use MIME::Base64 qw(encode_base64 decode_base64);
use JSON::PP;
use Cwd qw(getcwd);
use POSIX qw(:sys_wait_h);

my $sockpath = shift @ARGV;
# A host just started may take a moment to listen.
my $sock;
for (1 .. 50) { $sock = IO::Socket::UNIX->new(Type => SOCK_STREAM(), Peer => $sockpath); last if $sock; select(undef, undef, undef, 0.1); }
if (!$sock) { print STDERR "agentbox cloud: the cloud host is not running ($!)\n"; exit 75; }
binmode($sock); binmode(STDIN); binmode(STDOUT); binmode(STDERR);
$sock->autoflush(1);

sub put { my ($line) = @_; local $SIG{PIPE} = 'IGNORE'; print {$sock} "$line\n"; }

put(JSON::PP->new->canonical->encode({ argv => [@ARGV], env => {%ENV}, cwd => getcwd(), pid => $$ }));
for my $sig (qw(TERM INT HUP)) { $SIG{$sig} = sub { put("k SIG$sig"); }; }

my $sel = IO::Select->new($sock, \*STDIN);
my ($buf, $code, $parent, $orphaned) = ('', undef, getppid(), 0);
while (1) {
  my @ready = $sel->can_read(1);
  # The app gone without a word: the run is left going, as on a quit.
  if (!$orphaned && getppid() != $parent) { $orphaned = 1; put('k SIGHUP'); }
  for my $fh (@ready) {
    if ($fh == $sock) {
      my $n = sysread($sock, my $chunk, 65536);
      if (!defined $n) { next if $!{EINTR}; $n = 0; }
      if (!$n) { exit(defined $code ? $code : 75); }
      $buf .= $chunk;
      while ((my $i = index($buf, "\n")) >= 0) {
        my $line = substr($buf, 0, $i);
        $buf = substr($buf, $i + 1);
        my ($tag, $rest) = (substr($line, 0, 1), substr($line, 2));
        if ($tag eq 'o') { my $d = decode_base64($rest); my $off = 0; while ($off < length $d) { my $w = syswrite(STDOUT, $d, length($d) - $off, $off); last unless defined $w; $off += $w; } }
        elsif ($tag eq 'e') { my $d = decode_base64($rest); syswrite(STDERR, $d); }
        elsif ($tag eq 'x') { $code = int($rest); }
      }
    } else {
      my $n = sysread(STDIN, my $chunk, 65536);
      if (!defined $n) { next if $!{EINTR}; $n = 0; }
      if (!$n) { put('I'); $sel->remove(\*STDIN); }
      else { put('i ' . encode_base64($chunk, '')); }
    }
  }
}
