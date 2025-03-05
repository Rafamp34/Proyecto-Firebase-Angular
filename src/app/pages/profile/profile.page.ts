import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Subject, lastValueFrom, of } from 'rxjs';
import { takeUntil, switchMap, catchError, filter, map } from 'rxjs/operators';
import { BaseAuthenticationService } from 'src/app/core/services/impl/base-authentication.service';
import { PlaylistsService } from 'src/app/core/services/impl/playlists.service';
import { User } from 'src/app/core/models/user.model';
import { Playlist } from 'src/app/core/models/playlist.model';
import { BaseMediaService } from 'src/app/core/services/impl/base-media.service';
import { EditProfileModalComponent } from '../../shared/components/edit-profile-modal/edit-profile-modal.component';
import { UserService } from 'src/app/core/services/impl/user.service';
import { PlaylistModalComponent } from '../../shared/components/playlist-modal/playlist-modal.component';

function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
})
export class ProfilePage implements OnInit, OnDestroy {
  page: number = 1;
  pageSize: number = 25;
  pages: number = 0;

  user?: User | null;
  followingCount = 4;
  private _playlists = new BehaviorSubject<Playlist[]>([]);
  playlists$ = this._playlists.asObservable();
  
  // Subject para gestionar las suscripciones
  private destroy$ = new Subject<void>();

  formGroup: FormGroup;
  changePasswordForm: FormGroup;
  profilePictureControl = new FormControl('');

  constructor(
    private authService: BaseAuthenticationService,
    private loadingController: LoadingController,
    private toastController: ToastController,
    private translateService: TranslateService,
    private playlistsService: PlaylistsService,
    private router: Router,
    private modalCtrl: ModalController,
    private fb: FormBuilder,
    private mediaService: BaseMediaService,
    private userService: UserService,
    private authSvc: BaseAuthenticationService
  ) {
    console.log('ProfilePage: constructor called');
    
    // Changed username to displayName to match EditProfileModalComponent
    this.formGroup = this.fb.group({
      displayName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      image: ['']
    });

    this.changePasswordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]]
    });

    this.profilePictureControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        console.log('Profile picture value changed:', value);
      });
  }

  ngOnInit() {
    console.log('ProfilePage: ngOnInit started');
    this.loadUserData();
  }

  ngOnDestroy() {
    console.log('ProfilePage: ngOnDestroy called');
    // Completar el Subject para cancelar todas las suscripciones
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadUserData() {
    console.log('Loading user data...');
    // Cargar usuario actual
    this.authService.getCurrentUser()
      .then(currentUser => {
        console.log('Current user:', currentUser);
        
        // Si hay usuario, cargar sus detalles completos
        if (currentUser) {
          this.userService.getById(currentUser.id)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (fullUser) => {
                console.log('Full user loaded:', fullUser);
                this.user = fullUser;
                
                // Cargar playlists usando el displayName del usuario
                if (fullUser) {
                  const displayName = fullUser.displayName || `${fullUser.name || ''} ${fullUser.surname || ''}`.trim();
                  console.log('Using displayName for playlist loading:', displayName);
                  this.loadPlaylistsByAuthor(displayName);
                } else {
                  console.error('Full user data is null or undefined');
                  this._playlists.next([]);
                }
              },
              error: (error) => {
                console.error('Error loading user details:', error);
                this.showErrorToast('COMMON.ERROR.LOAD');
              }
            });
        } else {
          console.error('No authenticated user found');
          this._playlists.next([]);
        }
      })
      .catch(error => {
        console.error('Error getting current user:', error);
        this.showErrorToast('COMMON.ERROR.LOAD');
      });
  }

  private loadPlaylistsByAuthor(displayName: string) {
    console.log('Loading playlists for author:', displayName);
    
    if (!displayName || displayName.trim() === '') {
      console.warn('Empty displayName, cannot load playlists');
      this._playlists.next([]);
      return;
    }
    
    // Usar método personalizado para carga por author
    this.loadPlaylistsByAuthorName(displayName);
  }

  private loadPlaylistsByAuthorName(authorName: string) {
    console.log('Searching playlists with author name:', authorName);
    
    // Cargar todas las playlists y filtrar por autor
    this.playlistsService.getAll(1, 100)
      .pipe(
        takeUntil(this.destroy$),
        map(response => {
          const allPlaylists = Array.isArray(response) ? response : response.data;
          console.log('Total playlists retrieved:', allPlaylists.length);
          
          // Filtrar por nombre de autor - añadido chequeo de nulos
          const userPlaylists = allPlaylists.filter(playlist => {
            if (!playlist.author || !authorName) return false;
            
            const authorMatch = playlist.author.includes(authorName);
            if (authorMatch) {
              console.log(`Found matching playlist: ${playlist.name} with author ${playlist.author}`);
            }
            return authorMatch;
          });
          
          console.log(`Found ${userPlaylists.length} playlists for author ${authorName}`);
          return userPlaylists;
        }),
        catchError(error => {
          console.error('Error loading playlists by author:', error);
          return of([]);
        })
      )
      .subscribe(playlists => {
        console.log('Setting playlists in view:', playlists);
        this._playlists.next(playlists);
      });
  }

  async openPlaylistModal() {
    const user = await this.authSvc.getCurrentUser();
    if (!user) {
      console.error('No user found');
      return;
    }

    const modal = await this.modalCtrl.create({
      component: PlaylistModalComponent,
      componentProps: {},
      cssClass: 'custom-modal spotify-theme'
    });

    modal.onDidDismiss().then((result) => {
      if (result.role === 'create') {
        // Determinar el autor - cambiado username a displayName
        let author = user.displayName || '';
        if (this.user) {
          author = this.user.displayName || `${this.user.name || ''} ${this.user.surname || ''}`.trim();
        }
        
        // Verificar que author no sea vacío
        if (!author || author.trim() === '') {
          console.error('Cannot create playlist with empty author name');
          this.showErrorToast('PLAYLIST.ERRORS.CREATE');
          return;
        }
        
        const newPlaylist: Playlist = {
          name: result.data.name,
          author: author.trim(), // Asegurarse de que no hay espacios extra
          duration: '0:00',
          song_IDS: [],
          users_IDS: user.id ? [user.id] : [],
          ...(result.data.image && {
            image: {
              url: result.data.image.url,
              thumbnail: result.data.image.url,
              large: result.data.image.url,
              medium: result.data.image.url,
              small: result.data.image.url
            }
          })
        };

        console.log('Creating new playlist with author:', author);

        this.playlistsService.add(newPlaylist)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (createdPlaylist) => {
              console.log('Playlist created successfully:', createdPlaylist);
              // Recargar playlists
              if (this.user) {
                const displayName = this.user.displayName || `${this.user.name || ''} ${this.user.surname || ''}`.trim();
                this.loadPlaylistsByAuthor(displayName);
              }
            },
            error: (err) => {
              console.error('Error creating playlist:', err);
              this.showErrorToast('PLAYLIST.ERRORS.LOAD');
            }
          });
      }
    });

    await modal.present();
  }

  private async showErrorToast(message: string) {
    const toast = await this.toastController.create({
      message: await lastValueFrom(this.translateService.get(message)),
      duration: 3000,
      position: 'bottom',
      color: 'danger'
    });
    await toast.present();
  }

  private async showSuccessToast(message: string) {
    const toast = await this.toastController.create({
      message: await lastValueFrom(this.translateService.get(message)),
      duration: 3000,
      position: 'bottom',
      color: 'success'
    });
    await toast.present();
  }

  async onPhotoClick() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    
    fileInput.onchange = async (e: any) => {
      if (e.target?.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        
        try {
          const loadingElement = await this.loadingController.create();
          await loadingElement.present();
          
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              if (typeof reader.result === 'string') {
                await this.onProfilePictureChange(reader.result);
              }
            } catch (error) {
              console.error('Error processing image:', error);
              this.showErrorToast('COMMON.ERROR.UPLOAD');
            } finally {
              loadingElement.dismiss();
            }
          };
          reader.readAsDataURL(file);
          
        } catch (error) {
          console.error(error);
          this.showErrorToast('COMMON.ERROR.UPLOAD');
        }
      }
    };
    
    fileInput.click();
  }
  
  private async onProfilePictureChange(newPicture: string) {
    if (!this.user?.id) return;
  
    const loadingElement = await this.loadingController.create({
      message: await lastValueFrom(this.translateService.get('COMMON.LOADING'))
    });
  
    try {
      await loadingElement.present();
  
      if (newPicture) {
        const blob = dataURLtoBlob(newPicture);
        console.log('Blob created:', blob);
        
        const uploadResult = await lastValueFrom(this.mediaService.upload(blob));
        console.log('Upload result:', uploadResult);
        
        if (uploadResult && uploadResult[0]) {
          const imageUrl = uploadResult[0] as unknown as string;
          console.log('Image URL:', imageUrl);
  
          const updateData: Partial<User> = {
            image: {
              url: imageUrl,
              large: imageUrl,
              medium: imageUrl,
              small: imageUrl,
              thumbnail: imageUrl
            }
          };
  
          const updatedUser = await lastValueFrom(this.userService.updateProfile(this.user.id, updateData));
          
          if (updatedUser) {
            this.user = {
              ...this.user,
              ...updatedUser,
              image: updateData.image
            };
            
            this.profilePictureControl.setValue(imageUrl);
            console.log('Updated user image:', this.user.image);
          }
  
          await this.showSuccessToast('PROFILE.PHOTO_UPDATED');
        }
      }
    } catch (error) {
      console.error('Error updating profile picture:', error);
      await this.showErrorToast('COMMON.ERROR.UPLOAD');
    } finally {
      await loadingElement.dismiss();
    }
  }

  async openEditProfileModal() {
    console.log('Opening edit profile modal with user:', this.user);
    
    if (!this.user) {
      console.error('Cannot open edit profile modal: No user data available');
      await this.showErrorToast('COMMON.ERROR.LOAD');
      return;
    }
    
    const modal = await this.modalCtrl.create({
      component: EditProfileModalComponent,
      componentProps: {
        user: this.user
      },
      cssClass: 'custom-modal'
    });
    
    modal.onDidDismiss().then(result => {
      if (result.role === 'updated' && result.data) {
        // Actualizar el usuario con los datos devueltos
        this.user = {
          ...this.user,
          ...result.data
        };
        
        if (result.data.image) {
          if (result.data.image) {
            if (this.user) {
              this.user.image = { ...result.data.image };
            }
          }
        }
        
        // Actualizar también el formulario si está disponible
        if (this.formGroup) {
          this.formGroup.patchValue({
            displayName: this.user?.displayName || '',
            email: this.user?.email || '',
            image: this.user?.image?.url || ''
          });
        }
        
        // Actualizar el autorName para las playlists si ha cambiado el displayName
        if (this.user && this.user.displayName) {
          console.log('DisplayName updated, reloading playlists');
          this.loadPlaylistsByAuthor(this.user.displayName);
        }
      }
    });
    
    return await modal.present();
  }
  
  logout() {
    this.authService.signOut()
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.router.navigate(['/login']);
      });
  }
}