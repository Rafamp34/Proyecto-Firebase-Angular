import { Injectable, Inject } from '@angular/core';
import { BaseService } from './base-service.service';
import { IPlaylistsService } from '../interfaces/playlists-service.interface';
import { Playlist } from '../../models/playlist.model';
import { PLAYLISTS_REPOSITORY_TOKEN } from '../../repositories/repository.tokens';
import { Paginated } from '../../models/paginated.model';
import { IPlaylistsRepository } from '../../repositories/intefaces/playlists-repository.interface';
import { map, Observable, switchMap, catchError, of } from 'rxjs';
import { SearchParams } from '../../repositories/intefaces/base-repository.interface';

@Injectable({
  providedIn: 'root'
})
export class PlaylistsService extends BaseService<Playlist> implements IPlaylistsService {
  constructor(
    @Inject(PLAYLISTS_REPOSITORY_TOKEN) repository: IPlaylistsRepository
  ) {
    super(repository);
  }

  override add(playlist: any): Observable<Playlist> {
    const playlistData: Playlist = {
      id: playlist.id,
      name: playlist.name,
      author: playlist.author,
      duration: playlist.duration,
      song_IDS: playlist.song_IDS || [],
      users_IDS: playlist.users_IDS || [],
      image: playlist.image ? {
        url: playlist.image?.url,
        large: playlist.image?.large,
        medium: playlist.image?.medium,
        small: playlist.image?.small,
        thumbnail: playlist.image?.thumbnail
      } : undefined
    };
    return super.add(playlistData);
  }

  override update(id: string, playlist: any): Observable<Playlist> {
    const playlistData: Playlist = {
      id,
      name: playlist.name,
      author: playlist.author,
      duration: playlist.duration,
      song_IDS: playlist.song_IDS || [],
      users_IDS: playlist.users_IDS || [],
      image: playlist.image ? {
        url: playlist.image?.url,
        large: playlist.image?.large,
        medium: playlist.image?.medium,
        small: playlist.image?.small,
        thumbnail: playlist.image?.thumbnail
      } : undefined
    };
    return super.update(id, playlistData);
  }
  
  getAllByUser(userId: string): Observable<Playlist[]> {
    console.log('Getting all playlists for user:', userId);
    const filters: SearchParams = { 'user': userId };
    return this.repository.getAll(1, 1000, filters).pipe(
      map(res => Array.isArray(res) ? res : res.data),
      catchError(error => {
        console.error('Error in getAllByUser:', error);
        return of([]);
      })
    );
  }
  
  getByUserId(userId: string): Observable<Playlist[] | null> {
    console.log('Getting playlists by user ID:', userId);
    return this.repository.getAll(1, 1000, {}).pipe(
      map(res => {
        const playlists = Array.isArray(res) ? res : res.data;
        // Comprobación de seguridad para users_IDS
        return playlists.filter(playlist => 
          playlist.users_IDS && Array.isArray(playlist.users_IDS) && 
          playlist.users_IDS.includes(userId)
        );
      }),
      catchError(error => {
        console.error('Error in getByUserId:', error);
        return of([]);
      })
    );
  }

  // Nuevo método para buscar por displayName (que es lo que tienes en author)
  getByUserDisplayName(displayName: string): Observable<Playlist[] | null> {
    console.log('Getting playlists by displayName:', displayName);
    if (!displayName) {
      return of([]);
    }
    
    return this.repository.getAll(1, 1000, {}).pipe(
      map(res => {
        const playlists = Array.isArray(res) ? res : res.data;
        return playlists.filter(playlist => 
          playlist.author && playlist.author.toLowerCase() === displayName.toLowerCase()
        );
      }),
      catchError(error => {
        console.error('Error in getByUserDisplayName:', error);
        return of([]);
      })
    );
  }

  getUserPlaylists(userId: string): Observable<Playlist[] | Paginated<Playlist>> {
    const filters: SearchParams = { 'user': userId };
    return this.getAll(1, 25, filters).pipe(
      catchError(error => {
        console.error('Error in getUserPlaylists:', error);
        return of([]);
      })
    );
  }

  addSong(playlistId: string, songId: string): Observable<Playlist> {
    return this.getById(playlistId).pipe(
      switchMap(playlist => {
        if (!playlist) throw new Error('Playlist not found');
        const updatedPlaylist: Playlist = {
          ...playlist,
          song_IDS: playlist.song_IDS ? [...playlist.song_IDS, songId] : [songId]
        };
        return this.update(playlistId, updatedPlaylist);
      }),
      catchError(error => {
        console.error('Error adding song to playlist:', error);
        throw error; // Re-lanzar para que el componente pueda manejarlo
      })
    );
  }

  removeSong(playlistId: string, songId: string): Observable<Playlist> {
    return this.getById(playlistId).pipe(
      switchMap(playlist => {
        if (!playlist) throw new Error('Playlist not found');
        const updatedPlaylist: Playlist = {
          ...playlist,
          song_IDS: playlist.song_IDS ? playlist.song_IDS.filter(id => id !== songId) : []
        };
        return this.update(playlistId, updatedPlaylist);
      }),
      catchError(error => {
        console.error('Error removing song from playlist:', error);
        throw error; // Re-lanzar para que el componente pueda manejarlo
      })
    );
  }
}