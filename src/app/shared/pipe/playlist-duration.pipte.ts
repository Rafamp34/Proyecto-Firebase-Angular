import { Pipe, PipeTransform } from '@angular/core';
import { Song } from '../../core/models/song.model';

@Pipe({
  name: 'playlistDuration'
})
export class PlaylistDurationPipe implements PipeTransform {
  transform(songs: Song[], format: 'short' | 'long' = 'short'): string {
    if (!songs || songs.length === 0) {
      return format === 'short' ? '0:00' : '0 min';
    }

    console.log('Playlist songs for duration calculation:', songs);

    const totalSeconds = songs.reduce((acc, song) => {
      let songDuration = 0;
      if (typeof song.duration === 'string' && song.duration.includes(':')) {
        const [mins, secs] = song.duration.split(':').map(Number);
        songDuration = mins * 60 + secs;
      } 
      else if (typeof song.duration === 'number') {
        songDuration = song.duration;
      }
      else if (typeof song.duration === 'string' && !isNaN(Number(song.duration))) {
        songDuration = Number(song.duration);
      }
      else {
        console.warn(`Unexpected duration format for song: ${song.name}`, song.duration);
        return acc;
      }

      console.log(`Calculated song duration for ${song.name}:`, songDuration);
      return acc + songDuration;
    }, 0);

    console.log('Total playlist duration in seconds:', totalSeconds);

    const result = format === 'short' ? 
      this.formatShortDuration(totalSeconds) : 
      this.formatLongDuration(totalSeconds);

    console.log('Formatted duration:', result);
    return result;
  }

  private formatShortDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${this.padNumber(minutes)}:${this.padNumber(seconds)}`;
    }
    return `${minutes}:${this.padNumber(seconds)}`;
  }

  private formatLongDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }

  private padNumber(num: number): string {
    return num.toString().padStart(2, '0');
  }
}